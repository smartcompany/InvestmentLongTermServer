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
      return '※ 오늘의 시황은 참고용이며, 투자 권유·매매 추천이 아닙니다. 최종 판단은 본인 책임입니다.';
    case 'ja':
      return '※ 本日の市況は参考情報であり、投資勧誘・売買推奨ではありません。';
    case 'zh':
      return '※ 今日市况仅供参考，不构成投资建议或买卖推荐。';
    default:
      return '※ Today\'s briefing is for reference only — not investment advice.';
  }
}

function buildSystemInstruction(
  locale: MarketBriefingRequest['locale'],
): string {
  const label = languageLabel(locale);
  return [
    '당신은 개인 투자자를 위한 "오늘의 시황" 브리핑 에디터입니다.',
    '목표는 사용자가 매일 다시 들어오게 만드는, 짧고 명확한 오늘자 시황 안내입니다.',
    '최근 트렌드와 일반적인 시장 맥락을 바탕으로 설명하되, 실시간 확정·내부 정보처럼 말하지 마세요.',
    '특정 종목 매수/매도, 목표가, 레버리지, 수익 보장은 금지합니다.',
    '사용자의 보유 자산과 관련된 포인트만 골라 연결해 주세요. 보유와 무관한 장황한 뉴스는 줄이세요.',
    '향후 전망은 "며칠~몇 주" 단위의 가능성으로만 말하세요.',
    '보유 자산마다 오늘의 "컨디션"을 아이코닉하게 매겨 주세요. mood는 반드시 다음 중 하나만 쓰세요: hot, steady, choppy, cool, watch.',
    'hot=강한 상승 기운, steady=비교적 안정, choppy=출렁임/변동성, cool=식는 흐름/약세 압력, watch=이벤트·관망 필요.',
    'label은 재미있고 짧은 한 단어~짧은 구절(예: 불타오름, 잔잔함, 출렁임, 한숨 돌리기, 촉각 곤두세움).',
    'note는 그 자산의 오늘 컨디션을 한 줄로.',
    `모든 필드 내용은 ${label}로 작성하세요. (mood 영문 키는 예외)`,
    '아래 JSON 형식만 출력하세요:',
    '{"todayHeadline":"문자열","marketSummary":"문자열","assetConditions":[{"assetId":"문자열","name":"문자열","mood":"hot|steady|choppy|cool|watch","label":"문자열","note":"문자열"}],"holdingsFocus":["문자열"],"nearTermOutlook":"문자열","watchPoints":["문자열"]}',
    'todayHeadline: 오늘 시황을 한 줄로 (20자 내외 권장, 최대 한 문장).',
    'marketSummary: 오늘/최근 시장 흐름 요약 2~4문장.',
    'assetConditions: 사용자가 보낸 보유 자산마다 1개씩(최대 12개). assetId는 요청의 자산ID를 그대로 사용.',
    'holdingsFocus: 보유 자산과 맞닿는 포인트 2~4개.',
    'nearTermOutlook: 향후 며칠~몇 주 가능성 2~4문장.',
    'watchPoints: 오늘 이후 지켜볼 점 2~4개.',
  ].join('\n');
}

function buildUserPrompt(input: MarketBriefingRequest): string {
  const asOf =
    input.asOfDate?.trim() || new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `기준일(오늘): ${asOf}`,
    `표시 통화: ${input.displayCurrency}`,
    `보유 종목 수: ${input.assets.length}`,
    '보유 자산(시황 연결용):',
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
