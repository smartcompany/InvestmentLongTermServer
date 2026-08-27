import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, getSupabase } from '@/lib/supabase';

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId =
      typeof body.deviceId === 'string' ? body.deviceId.trim() : '';

    if (!deviceId || deviceId.length < 8) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = getSupabase();

    const { data: existing, error: findError } = await supabase
      .from('assetfit_anonymous_users')
      .select('anonymous_id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (findError) {
      console.error('[anonymous-id] find error:', findError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500, headers: corsHeaders },
      );
    }

    if (existing?.anonymous_id) {
      await supabase
        .from('assetfit_anonymous_users')
        .update({ updated_at: new Date().toISOString() })
        .eq('anonymous_id', existing.anonymous_id);

      return NextResponse.json(
        { anonymousId: existing.anonymous_id },
        { status: 200, headers: corsHeaders },
      );
    }

    const { data: created, error: insertError } = await supabase
      .from('assetfit_anonymous_users')
      .insert({ device_id: deviceId })
      .select('anonymous_id')
      .single();

    if (insertError || !created?.anonymous_id) {
      // Race: another request may have inserted
      const { data: raced } = await supabase
        .from('assetfit_anonymous_users')
        .select('anonymous_id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (raced?.anonymous_id) {
        return NextResponse.json(
          { anonymousId: raced.anonymous_id },
          { status: 200, headers: corsHeaders },
        );
      }

      console.error('[anonymous-id] insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create anonymous id' },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      { anonymousId: created.anonymous_id },
      { status: 201, headers: corsHeaders },
    );
  } catch (e) {
    console.error('[anonymous-id] error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
