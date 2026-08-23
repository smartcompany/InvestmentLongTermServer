import { z } from 'zod';

import { geminiAi } from '@/lib/ai-client';
import { isRetryableGeminiError } from '@/lib/gemini-errors';
import { holdingSchema } from '@/lib/investment-insight';
const GEMINI_PRESET = 'default_lite' as const;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 800;

export const marketBriefingRequestSchema = z.object({
  locale: z.enum(['en', 'ko', 'ja', 'zh']).default('ko'),
  displayCurrency: z.string().min(1).max(8).default('₩'),
  /** ISO date YYYY-MM-DD (client local date preferred) */
  asOfDate: z.string().min(8).max(32).optional(),
  assets: z.array(holdingSchema).min(1).max(40),
});

export type MarketBriefingRequest = z.infer<typeof marketBriefingRequestSchema>;

const assetConditionSchema = z.object({
  assetId: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  /** iconic mood for UI icons */
  mood: z.enum(['hot', 'steady', 'choppy', 'cool', 'watch']),
  /** short playful label, e.g. 불타오름 / 잔잔함 */
  label: z.string().min(1).max(40),
  /** one-line condition note */
  note: z.string().min(1).max(160),
});

const marketBriefingResponseSchema = z.object({
  todayHeadline: z.string().min(1).max(200),
  marketSummary: z.string().min(1).max(1200),
  assetConditions: z.array(assetConditionSchema).max(20).optional().default([]),
  holdingsFocus: z.array(z.string().min(1).max(400)).min(1).max(6),
  nearTermOutlook: z.string().min(1).max(1200),
  watchPoints: z.array(z.string().min(1).max(400)).min(1).max(6),
});

export type MarketBriefing = z.infer<typeof marketBriefingResponseSchema> & {
  disclaimer: string;
  asOfDate: string;
};

function languageLabel(code: MarketBriefingRequest['locale']): string {
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

function disclaimerFor(locale: MarketBriefingRequest['locale']): string {
  switch (locale) {
    case 'ko':
      return '※ 내 자산 트렌드는 참고용이며, 투자 권유·매매 추천이 아닙니다. 최종 판단은 본인 책임입니다.';
    case 'ja':
      return '※ 保有資産トレンドは参考情報であり、投資勧誘・売買推奨ではありません。';
    case 'zh':
      return '※ 持仓趋势仅供参考，不构成投资建议或买卖推荐。';
    default:
      return '※ Holdings trend briefing is for reference only — not investment advice.';
  }
}

function buildSystemInstruction(
  locale: MarketBriefingRequest['locale'],
): string {
  const label = languageLabel(locale);
  return [
    '당신은 개인 투자자의 "내 보유 자산 최근 트렌드" 브리핑 에디터입니다.',
    '핵심: 전체 시장 뉴스가 아니라, 사용자가 보낸 보유 자산 목록이 주인공입니다.',
    '거시 경제·지수 전반 이야기는 보유 자산과 직접 연결될 때만 한 문장 이내로만 언급하세요.',
    '각 보유 자산(또는 같은 유형 그룹)의 최근 흐름·이슈·변동성·관심 포인트를 중심으로 쓰세요.',
    '실시간 확정·내부 정보처럼 말하지 말고, 가능성·범위로 표현하세요.',
    '특정 종목 매수/매도, 목표가, 레버리지, 수익 보장은 금지합니다.',
    '보유 자산마다 오늘의 "컨디션"을 아이코닉하게 매겨 주세요. mood는 반드시 다음 중 하나만: hot, steady, choppy, cool, watch.',
    'hot=강한 모멘텀, steady=비교적 안정, choppy=출렁임/변동성, cool=식는 흐름/약세 압력, watch=이벤트·관망 필요.',
    'label은 재미있고 짧은 구절(예: 불타오름, 잔잔함, 출렁임, 한숨 돌리기, 촉각 곤두세움).',
    'note는 그 자산의 오늘/최근 컨디션을 한 줄로 (반드시 해당 자산 이름·상황을 언급).',
    `모든 필드 내용은 ${label}로 작성하세요. (mood 영문 키는 예외)`,
    '아래 JSON 형식만 출력하세요:',
    '{"todayHeadline":"문자열","marketSummary":"문자열","assetConditions":[{"assetId":"문자열","name":"문자열","mood":"hot|steady|choppy|cool|watch","label":"문자열","note":"문자열"}],"holdingsFocus":["문자열"],"nearTermOutlook":"문자열","watchPoints":["문자열"]}',
    'todayHeadline: 내 보유 자산 관점의 오늘 한 줄 요약 (보유 종목/유형을 직접 언급).',
    'marketSummary: 내 보유 자산들의 최근 트렌드·흐름 2~4문장. 전체 시장 총평 금지.',
    'assetConditions: 요청된 보유 자산마다 1개씩(최대 12개). assetId는 요청의 자산ID 그대로.',
    'holdingsFocus: 각 보유 자산(또는 핵심 2~4개)에 대한 구체 포인트. 일반론 금지.',
    'nearTermOutlook: 내 보유 자산 기준 향후 며칠~몇 주 가능성 2~4문장.',
    'watchPoints: 내 보유와 직접 관련된 지켜볼 점 2~4개.',
  ].join('\n');
}

function buildUserPrompt(input: MarketBriefingRequest): string {
  const asOf =
    input.asOfDate?.trim() || new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `기준일: ${asOf}`,
    `표시 통화: ${input.displayCurrency}`,
    `이 사용자의 보유 자산 수: ${input.assets.length}`,
    '아래 목록만 기준으로 "내 자산 최근 트렌드"를 작성하세요. 목록에 없는 자산/섹터는 다루지 마세요.',
    '보유 자산 목록:',
  ];

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

async function generateBriefingOnce(
  input: MarketBriefingRequest,
): Promise<MarketBriefing> {
  const asOf =
    input.asOfDate?.trim() || new Date().toISOString().slice(0, 10);

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
  const validated = marketBriefingResponseSchema.parse(parsed);

  // 요청에 없는 assetId는 걸러내고, 누락 자산은 기본 watch로 보강
  const requestedIds = new Set(input.assets.map((a) => a.assetId));
  const byId = new Map(
    validated.assetConditions
      .filter((c) => requestedIds.has(c.assetId))
      .map((c) => [c.assetId, c] as const),
  );

  const assetConditions = input.assets.slice(0, 12).map((asset) => {
    const existing = byId.get(asset.assetId);
    if (existing) return existing;
    return {
      assetId: asset.assetId,
      name: asset.name,
      mood: 'watch' as const,
      label:
        input.locale === 'ko'
          ? '관망'
          : input.locale === 'ja'
            ? '様子見'
            : input.locale === 'zh'
              ? '观望'
              : 'Watch',
      note:
        input.locale === 'ko'
          ? '오늘은 흐름을 조금 더 지켜보면 좋아요.'
          : 'Worth watching the flow a bit more today.',
    };
  });

  return {
    ...validated,
    assetConditions,
    disclaimer: disclaimerFor(input.locale),
    asOfDate: asOf,
  };
}

export async function generateMarketBriefing(
  input: MarketBriefingRequest,
): Promise<MarketBriefing> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      return await generateBriefingOnce(input);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === GEMINI_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn('[market-briefing] Gemini retryable error; retrying', {
        attempt,
        delayMs,
        message: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Market briefing generation failed');
}
