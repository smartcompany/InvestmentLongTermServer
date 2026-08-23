import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  clientMessageForGeminiError,
  httpStatusForGeminiError,
} from '@/lib/gemini-errors';
import {
  generateInvestmentInsight,
  insightRequestSchema,
} from '@/lib/investment-insight';

function clientErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return 'Invalid insight response from AI';
  }
  return clientMessageForGeminiError(error);
}

function responseStatus(error: unknown): number {
  if (error instanceof z.ZodError) {
    return 502;
  }
  if (
    error instanceof Error &&
    error.message.includes('GEMINI_API_KEY')
  ) {
    return 503;
  }
  return httpStatusForGeminiError(error);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: NextRequest) {
  let body: z.infer<typeof insightRequestSchema>;
  try {
    body = insightRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const insight = await generateInvestmentInsight(body);
    return NextResponse.json(insight);
  } catch (error) {
    const message = clientErrorMessage(error);
    console.error('[POST /api/insights] error:', message);
    return NextResponse.json(
      {
        error: message,
        ...(error instanceof z.ZodError ? { details: error.flatten() } : {}),
      },
      { status: responseStatus(error) },
    );
  }
}
