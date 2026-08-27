import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { sendFcmToToken } from '@/lib/firebase-admin';
import {
  CHANGE_THRESHOLD,
  HoldingRow,
  computePortfolioTotal,
  dayKey,
} from '@/lib/portfolio-valuation';

function assertCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const today = dayKey();

  const { data: users, error: usersError } = await supabase
    .from('assetfit_anonymous_users')
    .select(
      'anonymous_id, fcm_token, locale, last_portfolio_total, last_change_notify_day, push_enabled',
    )
    .eq('push_enabled', true)
    .not('fcm_token', 'is', null);

  if (usersError) {
    console.error('[cron/portfolio-change] users error:', usersError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  let checked = 0;
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users ?? []) {
    checked += 1;
    try {
      const { data: holdings, error: holdingsError } = await supabase
        .from('assetfit_holdings')
        .select(
          'id, asset_id, asset_name, quantity, initial_amount, registered_date, annual_interest_rate, symbol, asset_type',
        )
        .eq('anonymous_id', user.anonymous_id);

      if (holdingsError) {
        errors += 1;
        console.error('[cron] holdings error:', holdingsError);
        continue;
      }

      const rows = (holdings ?? []) as HoldingRow[];
      if (rows.length === 0) {
        skipped += 1;
        continue;
      }

      const total = await computePortfolioTotal(rows);
      if (total == null || !Number.isFinite(total)) {
        skipped += 1;
        continue;
      }

      const lastTotal =
        user.last_portfolio_total != null
          ? Number(user.last_portfolio_total)
          : null;

      if (lastTotal == null || lastTotal <= 0) {
        await supabase
          .from('assetfit_anonymous_users')
          .update({
            last_portfolio_total: total,
            updated_at: new Date().toISOString(),
          })
          .eq('anonymous_id', user.anonymous_id);
        skipped += 1;
        continue;
      }

      const changePct = (total - lastTotal) / lastTotal;

      await supabase
        .from('assetfit_anonymous_users')
        .update({
          last_portfolio_total: total,
          updated_at: new Date().toISOString(),
        })
        .eq('anonymous_id', user.anonymous_id);

      if (Math.abs(changePct) < CHANGE_THRESHOLD) {
        skipped += 1;
        continue;
      }

      if (user.last_change_notify_day === today) {
        skipped += 1;
        continue;
      }

      const token = user.fcm_token as string;
      const pctText = (changePct * 100).toFixed(1);
      const sign = changePct >= 0 ? '+' : '';
      const locale = (user.locale as string) || 'ko';
      const title =
        locale === 'en'
          ? 'Portfolio value changed'
          : '보유 자산 가치 변동';
      const body =
        locale === 'en'
          ? `Total value moved ${sign}${pctText}%. Check My Assets.`
          : `총 평가액이 ${sign}${pctText}% 변했어요. 내 자산에서 확인해 보세요.`;

      const sent = await sendFcmToToken({
        token,
        title,
        body,
        data: { payload: 'my_assets' },
      });

      if (sent) {
        await supabase
          .from('assetfit_anonymous_users')
          .update({
            last_change_notify_day: today,
            updated_at: new Date().toISOString(),
          })
          .eq('anonymous_id', user.anonymous_id);
        notified += 1;
      } else {
        errors += 1;
      }
    } catch (e) {
      errors += 1;
      console.error('[cron] user failed:', user.anonymous_id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    notified,
    skipped,
    errors,
    day: today,
  });
}
