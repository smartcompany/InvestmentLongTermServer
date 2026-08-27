import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron-auth';
import { broadcastAiContentPush } from '@/lib/ai-content-push';
import { dayKey } from '@/lib/portfolio-valuation';

export async function GET(request: NextRequest) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await broadcastAiContentPush('market_briefing');
    return NextResponse.json({
      ok: true,
      kind: 'market_briefing',
      ...result,
      day: dayKey(),
    });
  } catch (e) {
    console.error('[cron/ai-trend-push]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
