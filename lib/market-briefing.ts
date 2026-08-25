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
  userRequest: z.string().trim().max(500).optional(),
});

export type MarketBriefingRequest = z.infer<typeof marketBriefingRequestSchema>;

const moodEnum = z.enum(['hot', 'steady', 'choppy', 'cool', 'watch']);
type Mood = z.infer<typeof moodEnum>;

/** AI가 mood를 대문자/한글/유사어로 줘도 살리기 */
function normalizeMood(raw: unknown): Mood {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  const mapped: Record<string, Mood> = {
    hot: 'hot',
    fire: 'hot',
    bullish: 'hot',
    strong: 'hot',
    '불타': 'hot',
    '불타오름': 'hot',
    '강세': 'hot',
    steady: 'steady',
    calm: 'steady',
    stable: 'steady',
    '잔잔': 'steady',
    '잔잔함': 'steady',
    '안정': 'steady',
    choppy: 'choppy',
    volatile: 'choppy',
    wavy: 'choppy',
    '출렁': 'choppy',
    '출렁임': 'choppy',
    '변동': 'choppy',
    cool: 'cool',
    cold: 'cool',
    bearish: 'cool',
    weak: 'cool',
    '식음': 'cool',
    '약세': 'cool',
    '한숨': 'cool',
    watch: 'watch',
    caution: 'watch',
    wait: 'watch',
    '관망': 'watch',
    '주의': 'watch',
    '촉각': 'watch',
  };
  if (mapped[s]) return mapped[s];
  for (const [key, mood] of Object.entries(mapped)) {
    if (s.includes(key)) return mood;
  }
  return 'watch';
}

const assetConditionSchema = z.object({
  assetId: z.string().min(1).max(80),
  name: z.string().min(1).max(120).optional().default(''),
  /** iconic mood for UI icons — string then normalize (strict enum breaks whole JSON) */
  mood: z.union([moodEnum, z.string()]).optional().default('watch'),
  /** short playful label, e.g. 불타오름 / 잔잔함 */
  label: z.string().max(40).optional().default(''),
  /** one-line condition note */
  note: z.string().max(200).optional().default(''),
});

const marketBriefingCoreSchema = z.object({
  todayHeadline: z.string().min(1).max(200),
  marketSummary: z.string().min(1).max(1200),
  holdingsFocus: z.array(z.string().min(1).max(400)).min(1).max(6),
  nearTermOutlook: z.string().min(1).max(1200),
  watchPoints: z.array(z.string().min(1).max(400)).min(1).max(6),
});

export type MarketBriefing = z.infer<typeof marketBriefingCoreSchema> & {
  assetConditions: Array<{
    assetId: string;
    name: string;
    mood: Mood;
    label: string;
    note: string;
  }>;
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
    'userRequest가 있으면 그 질문에 우선적으로 답하되, 매매 지시가 아니라 트렌드·리스크·관점 설명으로만 답하세요.',
    '가독성: 딱딱한 설명문보다 스캔하기 쉽게 쓰세요. 핵심 종목명·흐름·리스크 키워드는 **볼드**로 감싸세요 (예: **비트코인**이 출렁입니다).',
    '헤드라인·불릿 앞에 이모지를 1개만 가볍게 쓸 수 있습니다. 문장마다·과도하게 쓰지 마세요. 예: 🔥 강세, 🌊 출렁, 👀 관망, 📌 포인트.',
    '톤은 친근하고 짧고 명확하게. 장황한 서론 없이 핵심을 앞에 두세요.',
    '보유 자산마다 오늘의 "컨디션"을 아이코닉하게 매겨 주세요. mood는 반드시 다음 중 하나만: hot, steady, choppy, cool, watch.',
    'hot=강한 모멘텀, steady=비교적 안정, choppy=출렁임/변동성, cool=식는 흐름/약세 압력, watch=이벤트·관망 필요.',
    'label은 재미있고 짧은 구절(예: 불타오름, 잔잔함, 출렁임, 한숨 돌리기, 촉각 곤두세움).',
    'note는 그 자산의 오늘/최근 컨디션을 한 줄로 (반드시 해당 자산 이름·상황을 언급). 핵심은 **볼드**.',
    `모든 필드 내용은 ${label}로 작성하세요. (mood 영문 키는 예외)`,
    '아래 JSON 형식만 출력하세요:',
    '{"todayHeadline":"문자열","marketSummary":"문자열","assetConditions":[{"assetId":"문자열","name":"문자열","mood":"hot|steady|choppy|cool|watch","label":"문자열","note":"문자열"}],"holdingsFocus":["문자열"],"nearTermOutlook":"문자열","watchPoints":["문자열"]}',
    'todayHeadline: 내 보유 자산 관점의 오늘 한 줄 요약. 앞에 이모지 1개 + 핵심 **볼드** 권장.',
    'marketSummary: 내 보유 자산들의 최근 트렌드·흐름 2~4문장. 전체 시장 총평 금지. 핵심 **볼드**.',
    'assetConditions: 요청된 보유 자산마다 1개씩(최대 12개). assetId는 요청의 자산ID 그대로.',
    'holdingsFocus: 각 보유 자산(또는 핵심 2~4개)에 대한 구체 포인트. 일반론 금지. 각 항목 앞에 이모지 1개 권장.',
    'nearTermOutlook: 내 보유 자산 기준 향후 며칠~몇 주 가능성 2~4문장.',
    'watchPoints: 내 보유와 직접 관련된 지켜볼 점 2~4개. 각 항목 앞에 👀/⚠️ 등 이모지 1개 권장.',
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

  const parsed = parseJsonFromModelText(text) as Record<string, unknown>;

  // assetConditions가 깨져도 본문 브리핑은 살리고, 조건은 항목별 느슨 파싱
  const rawConditions = Array.isArray(parsed.assetConditions)
    ? parsed.assetConditions
    : Array.isArray(parsed.holdingConditions)
      ? parsed.holdingConditions
      : [];
  const coreRaw = { ...parsed };
  delete coreRaw.assetConditions;
  delete coreRaw.holdingConditions;
  const validated = marketBriefingCoreSchema.parse(coreRaw);

  const defaultLabel =
    input.locale === 'ko'
      ? '관망'
      : input.locale === 'ja'
        ? '様子見'
        : input.locale === 'zh'
          ? '观望'
          : 'Watch';
  const defaultNote =
    input.locale === 'ko'
      ? '오늘은 흐름을 조금 더 지켜보면 좋아요.'
      : 'Worth watching the flow a bit more today.';
  const defaultLabels: Record<Mood, string> = {
    hot:
      input.locale === 'ko'
        ? '불타오름'
        : input.locale === 'ja'
          ? '勢い'
          : input.locale === 'zh'
            ? '火热'
            : 'Hot',
    steady:
      input.locale === 'ko'
        ? '잔잔함'
        : input.locale === 'ja'
          ? '落ち着き'
          : input.locale === 'zh'
            ? '平稳'
            : 'Steady',
    choppy:
      input.locale === 'ko'
        ? '출렁임'
        : input.locale === 'ja'
          ? '波乱'
          : input.locale === 'zh'
            ? '波动'
            : 'Choppy',
    cool:
      input.locale === 'ko'
        ? '한숨 돌리기'
        : input.locale === 'ja'
          ? '冷え'
          : input.locale === 'zh'
            ? '转冷'
            : 'Cooling',
    watch: defaultLabel,
  };

  const requestedIds = new Set(input.assets.map((a) => a.assetId));
  const byId = new Map<string, {
    assetId: string;
    name: string;
    mood: Mood;
    label: string;
    note: string;
  }>();

  for (const item of rawConditions) {
    const soft = assetConditionSchema.safeParse(item);
    if (!soft.success) continue;
    const c = soft.data;
    if (!requestedIds.has(c.assetId)) continue;
    const mood = normalizeMood(c.mood);
    byId.set(c.assetId, {
      assetId: c.assetId,
      name: c.name.trim() || c.assetId,
      mood,
      label: c.label.trim() || defaultLabels[mood],
      note: c.note.trim() || defaultNote,
    });
  }

  const assetConditions = input.assets.slice(0, 12).map((asset) => {
    const existing = byId.get(asset.assetId);
    if (existing) {
      return {
        ...existing,
        name: existing.name || asset.name,
      };
    }
    return {
      assetId: asset.assetId,
      name: asset.name,
      mood: 'watch' as const,
      label: defaultLabel,
      note: defaultNote,
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
