import { getSupabase } from '@/lib/supabase';
import { sendFcmToToken } from '@/lib/firebase-admin';

export type AiPushKind = 'market_briefing' | 'portfolio_insight';

type PushUser = {
  anonymous_id: string;
  fcm_token: string;
  locale: string | null;
};

function copyFor(kind: AiPushKind, locale: string): { title: string; body: string } {
  const isEn = locale === 'en';
  const isJa = locale === 'ja';
  const isZh = locale === 'zh';

  if (kind === 'market_briefing') {
    if (isEn) {
      return {
        title: 'AI My Assets Trend Review',
        body: 'Your holdings trend brief is ready — open the app to check it.',
      };
    }
    if (isJa) {
      return {
        title: 'AI最近の資産トレンド評価',
        body: '保有資産のトレンド評価の準備ができました。アプリで確認しましょう。',
      };
    }
    if (isZh) {
      return {
        title: 'AI近期持仓趋势评估',
        body: '持仓趋势评估已就绪，打开应用查看。',
      };
    }
    return {
      title: 'AI 내 자산 트렌드 평가',
      body: '오늘 보유 자산 흐름 AI 평가를 확인해 보세요.',
    };
  }

  if (isEn) {
    return {
      title: 'AI My Assets Portfolio Review',
      body: 'Time for a portfolio check — open the app for your AI review.',
    };
  }
  if (isJa) {
    return {
      title: 'AIポートフォリオ評価',
      body: 'ポートフォリオ点検のタイミングです。アプリでAI評価を確認しましょう。',
    };
  }
  if (isZh) {
    return {
      title: 'AI投资组合评估',
      body: '该做一次组合检查了，打开应用查看 AI 评估。',
    };
  }
  return {
    title: 'AI 내 자산 포트폴리오 평가',
    body: '이번 주 포트폴리오 AI 점검을 확인해 보세요.',
  };
}

export async function broadcastAiContentPush(kind: AiPushKind): Promise<{
  checked: number;
  notified: number;
  skipped: number;
  errors: number;
}> {
  const supabase = getSupabase();
  const payload =
    kind === 'market_briefing' ? 'ai_market_briefing' : 'ai_portfolio_insight';

  const categoryColumn =
    kind === 'market_briefing' ? 'push_ai_trend' : 'push_ai_portfolio';

  const { data: users, error: usersError } = await supabase
    .from('assetfit_anonymous_users')
    .select('anonymous_id, fcm_token, locale')
    .eq('push_enabled', true)
    .eq(categoryColumn, true)
    .not('fcm_token', 'is', null);

  if (usersError) {
    console.error(`[cron/${kind}] users error:`, usersError);
    throw new Error('Database error');
  }

  let checked = 0;
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of (users ?? []) as PushUser[]) {
    checked += 1;
    try {
      const { count, error: holdingsError } = await supabase
        .from('assetfit_holdings')
        .select('id', { count: 'exact', head: true })
        .eq('anonymous_id', user.anonymous_id);

      if (holdingsError) {
        errors += 1;
        console.error(`[cron/${kind}] holdings error:`, holdingsError);
        continue;
      }

      if (!count || count <= 0) {
        skipped += 1;
        continue;
      }

      const locale = user.locale || 'ko';
      const { title, body } = copyFor(kind, locale);
      const sent = await sendFcmToToken({
        token: user.fcm_token,
        title,
        body,
        data: { payload },
      });

      if (sent) {
        notified += 1;
      } else {
        errors += 1;
      }
    } catch (e) {
      errors += 1;
      console.error(`[cron/${kind}] user failed:`, user.anonymous_id, e);
    }
  }

  return { checked, notified, skipped, errors };
}
