import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, getSupabase } from '@/lib/supabase';

type AssetPayload = {
  id?: string;
  assetId?: string;
  assetName?: string;
  quantity?: number;
  initialAmount?: number;
  registeredDate?: string;
  annualInterestRate?: number;
  symbol?: string | null;
  assetType?: string | null;
};

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anonymousId = searchParams.get('anonymousId')?.trim() ?? '';
    const deviceId = searchParams.get('deviceId')?.trim() ?? '';

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
    const { data, error } = await supabase
      .from('assetfit_holdings')
      .select(
        'id, asset_id, asset_name, quantity, initial_amount, registered_date, annual_interest_rate, symbol, asset_type',
      )
      .eq('anonymous_id', anonymousId);

    if (error) {
      console.error('[my-assets] GET error:', error);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500, headers: corsHeaders },
      );
    }

    const assets = (data ?? []).map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      assetName: row.asset_name,
      quantity: Number(row.quantity),
      initialAmount: Number(row.initial_amount),
      registeredDate: row.registered_date,
      annualInterestRate: Number(row.annual_interest_rate ?? 0),
      symbol: row.symbol,
      assetType: row.asset_type,
    }));

    return NextResponse.json(assets, { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[my-assets] GET error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const anonymousId =
      typeof body.anonymousId === 'string' ? body.anonymousId.trim() : '';
    const deviceId =
      typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const assets = Array.isArray(body.assets)
      ? (body.assets as AssetPayload[])
      : null;

    if (!anonymousId || !deviceId || assets === null) {
      return NextResponse.json(
        { error: 'anonymousId, deviceId, and assets are required' },
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
    const now = new Date().toISOString();

    const { error: deleteError } = await supabase
      .from('assetfit_holdings')
      .delete()
      .eq('anonymous_id', anonymousId);

    if (deleteError) {
      console.error('[my-assets] delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to clear holdings' },
        { status: 500, headers: corsHeaders },
      );
    }

    const rows = assets
      .filter((a) => a.id && a.assetId && a.assetName)
      .map((a) => ({
        id: String(a.id),
        anonymous_id: anonymousId,
        asset_id: String(a.assetId),
        asset_name: String(a.assetName),
        quantity: Number(a.quantity ?? 0),
        initial_amount: Number(a.initialAmount ?? 0),
        registered_date: a.registeredDate
          ? new Date(a.registeredDate).toISOString()
          : now,
        annual_interest_rate: Number(a.annualInterestRate ?? 0),
        symbol: a.symbol ?? null,
        asset_type: a.assetType ?? null,
        updated_at: now,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('assetfit_holdings')
        .insert(rows);

      if (insertError) {
        console.error('[my-assets] insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to sync holdings' },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    await supabase
      .from('assetfit_anonymous_users')
      .update({ updated_at: now })
      .eq('anonymous_id', anonymousId);

    return NextResponse.json(
      { ok: true, count: rows.length },
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    console.error('[my-assets] PUT error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
