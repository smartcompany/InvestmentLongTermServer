import { z } from 'zod';

import { geminiAi } from '@/lib/ai-client';
import { isRetryableGeminiError } from '@/lib/gemini-errors';

const GEMINI_PRESET = 'default_lite' as const;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 800;

const localeSchema = z.enum(['en', 'ko', 'ja', 'zh']);

export const holdingSchema = z.object({
  name: z.string().min(1).max(120),
  assetId: z.string().min(1).max(80),
  type: z.string().min(1).max(40).optional(),
  quantity: z.number().finite().nonnegative().optional(),
  initialAmount: z.number().finite().optional(),
  currentValue: z.number().finite().optional(),
  returnRatePct: z.number().finite().optional(),
});

export const insightRequestSchema = z.object({
  locale: localeSchema.default('ko'),
  displayCurrency: z.string().min(1).max(8).default('₩'),
  totalPurchaseAmount: z.number().finite().optional(),
  totalCurrentValue: z.number().finite().optional(),
  totalReturnRatePct: z.number().finite().optional(),
  assets: z.array(holdingSchema).min(1).max(40),
  userRequest: z.string().trim().max(500).optional(),
});

export type InsightRequest = z.infer<typeof insightRequestSchema>;

const insightResponseSchema = z.object({
  summary: z.string().min(1).max(1200),
  outlook: z.string().min(1).max(1200),
  suggestions: z.array(z.string().min(1).max(400)).min(1).max(6),
  risks: z.array(z.string().min(1).max(400)).min(1).max(6),
});

export type InvestmentInsight = z.infer<typeof insightResponseSchema> & {
  disclaimer: string;
};

function languageLabel(code: z.infer<typeof localeSchema>): string {
  switch (code) {
    case 'ko':
      return '한국어';
    case 'ja':
      return '일본어';
    case 'zh':
      return '중국어(간체)';
    default:
      return '영어';
  }
}

function disclaimerFor(locale: z.infer<typeof localeSchema>): string {
  switch (locale) {
    case 'ko':
      return '※ 참고용 정보이며, 투자 권유·매매 추천이 아닙니다. 최종 판단은 본인 책임입니다.';
    case 'ja':
      return '※ 参考情報であり、投資勧誘・売買推奨ではありません。最終判断はご自身の責任でお願いします。';
    case 'zh':
      return '※ 仅供参考，不构成投资建议或买卖推荐。最终决策请自行负责。';
    default:
      return '※ For reference only — not investment advice or a buy/sell recommendation. You are responsible for your own decisions.';
  }
}

function buildSystemInstruction(locale: z.infer<typeof localeSchema>): string {
  const label = languageLabel(locale);
  return [
    '당신은 개인 투자자를 위한 차분한 장기 투자 코치입니다.',
    '사용자가 보낸 포트폴리오 스냅샷을 보고, 큰 방향성만 안내하세요.',
    '분산 투자, 특정 자산 편중(집중 리스크), 투자 기간을 중심으로 보세요.',
    '오늘의 세부 시황·단기 뉴스는 "오늘의 시황" 기능에서 다루므로, 여기서는 길게 쓰지 마세요.',
    '특정 종목의 매수/매도 주문, 목표가, 레버리지, 수익 보장은 절대 하지 마세요.',
    '내부 정보나 실시간 확정처럼 말하지 말고, 가능성·범위로 표현하세요.',
    'userRequest가 있으면 그 질문에 우선적으로 답하되, 매매 지시가 아니라 판단 관점·리스크·균형 관점으로만 설명하세요.',
    `모든 필드 내용은 ${label}로 작성하세요.`,
    '아래 JSON 형식만 출력하세요. 다른 설명 문구는 넣지 마세요:',
    '{"summary":"문자열","outlook":"문자열","suggestions":["문자열"],"risks":["문자열"]}',
    'summary: 장기 보유 관점에서 포트폴리오가 균형 잡혔는지 2~4문장.',
    'outlook: 보유 구조에 대한 중장기 관점 코멘트 2~4문장 (당일 시황 나열 금지).',
    'suggestions: 실행 가능한 마인드/프로세스 팁 2~4개 (종목 매매 지시 금지).',
    'risks: 주의할 점 2~4개.',
  ].join('\n');
}

function buildUserPrompt(input: InsightRequest): string {
  const lines: string[] = [
    `표시 통화: ${input.displayCurrency}`,
    `보유 종목 수: ${input.assets.length}`,
  ];

  if (input.totalPurchaseAmount != null) {
    lines.push(`총 투자 원금: ${input.totalPurchaseAmount}`);
  }
  if (input.totalCurrentValue != null) {
    lines.push(`총 현재 가치: ${input.totalCurrentValue}`);
  }
  if (input.totalReturnRatePct != null) {
    lines.push(`총 수익률(%): ${input.totalReturnRatePct.toFixed(2)}`);
  }

  lines.push('보유 자산 목록:');
  for (const asset of input.assets) {
    lines.push(
      JSON.stringify({
        이름: asset.name,
        자산ID: asset.assetId,
        유형: asset.type ?? null,
        수량: asset.quantity ?? null,
        투자원금: asset.initialAmount ?? null,
        현재가치: asset.currentValue ?? null,
        수익률_퍼센트:
          asset.returnRatePct != null
            ? Number(asset.returnRatePct.toFixed(2))
            : null,
      }),
    );
  }

  const userRequest = input.userRequest?.trim();
  if (userRequest) {
    lines.push('사용자 추가 요청(이 질문에 우선 답변):');
    lines.push(userRequest);
  }

  return lines.join('\n');
}

function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateInsightOnce(
  input: InsightRequest,
): Promise<InvestmentInsight> {
  const response = await geminiAi.createChatCompletion({
    preset: GEMINI_PRESET,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildSystemInstruction(input.locale),
      },
      {
        role: 'user',
        content: buildUserPrompt(input),
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty response from Gemini');
  }

  const parsed = parseJsonFromModelText(text);
  const validated = insightResponseSchema.parse(parsed);

  return {
    ...validated,
    disclaimer: disclaimerFor(input.locale),
  };
}

export async function generateInvestmentInsight(
  input: InsightRequest,
): Promise<InvestmentInsight> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      return await generateInsightOnce(input);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === GEMINI_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn('[investment-insight] Gemini retryable error; retrying', {
        attempt,
        delayMs,
        message: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Investment insight generation failed');
}
