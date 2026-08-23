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
      return 'Korean';
    case 'ja':
      return 'Japanese';
    case 'zh':
      return 'Simplified Chinese';
    default:
      return 'English';
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
    'You are a calm long-term investing coach for retail investors.',
    'Analyze the user portfolio snapshot and give high-level directional guidance.',
    'Consider diversification, concentration risk, time horizon, and general market context for the asset types held.',
    'Do NOT give specific buy/sell orders, price targets, leverage tips, or guarantees.',
    'Do NOT claim insider knowledge or real-time certainty; speak in probabilities and ranges.',
    `Write every field in ${label}.`,
    'Respond with JSON only in this exact shape:',
    '{"summary":"string","outlook":"string","suggestions":["string"],"risks":["string"]}',
    'summary: 2-4 sentences on whether the portfolio looks balanced for long-term holding.',
    'outlook: 2-4 sentences on current market context relevant to these holdings.',
    'suggestions: 2-4 short actionable mindset/process tips (not ticker orders).',
    'risks: 2-4 short risks to watch.',
  ].join('\n');
}

function buildUserPrompt(input: InsightRequest): string {
  const lines: string[] = [
    `Display currency: ${input.displayCurrency}`,
    `Holdings count: ${input.assets.length}`,
  ];

  if (input.totalPurchaseAmount != null) {
    lines.push(`Total purchase amount: ${input.totalPurchaseAmount}`);
  }
  if (input.totalCurrentValue != null) {
    lines.push(`Total current value: ${input.totalCurrentValue}`);
  }
  if (input.totalReturnRatePct != null) {
    lines.push(`Total return %: ${input.totalReturnRatePct.toFixed(2)}`);
  }

  lines.push('Holdings:');
  for (const asset of input.assets) {
    lines.push(
      JSON.stringify({
        name: asset.name,
        assetId: asset.assetId,
        type: asset.type ?? null,
        quantity: asset.quantity ?? null,
        initialAmount: asset.initialAmount ?? null,
        currentValue: asset.currentValue ?? null,
        returnRatePct:
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
