import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, getSupabase } from '@/lib/supabase';

async function assertDeviceOwnsAnonymous(
  anonymousId: string,
  deviceId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('assetfit_anonymous_users')
    .select('anonymous_id')
    .eq('anonymous_id', anonymousId)
    .eq('device_id', deviceId)
    .maybeSingle();
  return !!data?.anonymous_id;
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const anonymousId =
      typeof body.anonymousId === 'string' ? body.anonymousId.trim() : '';
    const deviceId =
      typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform =
      typeof body.platform === 'string' ? body.platform.trim() : null;
    const locale =
      typeof body.locale === 'string' ? body.locale.trim() : null;
    const pushEnabled =
      typeof body.pushEnabled === 'boolean' ? body.pushEnabled : true;

    if (!anonymousId || !deviceId) {
      return NextResponse.json(
        { error: 'anonymousId and deviceId are required' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!(await assertDeviceOwnsAnonymous(anonymousId, deviceId))) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders },
      );
    }

    const supabase = getSupabase();
    const update: Record<string, unknown> = {
      push_enabled: pushEnabled,
      updated_at: new Date().toISOString(),
    };

    if (token) update.fcm_token = token;
    if (!pushEnabled) update.fcm_token = null;
    if (platform) update.platform = platform;
    if (locale) update.locale = locale;

    const { error } = await supabase
      .from('assetfit_anonymous_users')
      .update(update)
      .eq('anonymous_id', anonymousId);

    if (error) {
      console.error('[push-token] update error:', error);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[push-token] error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
