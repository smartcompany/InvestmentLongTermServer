import { NextRequest, NextResponse } from 'next/server';
import { InvestmentConfig } from '@/types';
import { fetchPrices } from '@/lib/priceService';
import { calculateInvestment } from '@/lib/calculator';
import { getAssetById } from '@/lib/assets';

export async function POST(request: NextRequest) {
  try {
    const config: InvestmentConfig = await request.json();

    // Validate input
    const asset = config.asset ? getAssetById(config.asset) : undefined;
    if (!asset) {
      return NextResponse.json(
        { error: 'Invalid asset. Please select a supported asset.' },
        { status: 400 }
      );
    }

    if (!config.yearsAgo || config.yearsAgo < 1 || config.yearsAgo > 10) {
      return NextResponse.json(
        { error: 'Invalid yearsAgo. Must be between 1 and 10.' },
        { status: 400 }
      );
    }

    if (!config.amount || config.amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be greater than 0.' },
        { status: 400 }
      );
    }

    if (!config.type || !['single', 'recurring'].includes(config.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "single" or "recurring".' },
        { status: 400 }
      );
    }

    if (!config.frequency || !['monthly', 'weekly'].includes(config.frequency)) {
      return NextResponse.json(
        { error: 'Invalid frequency. Must be "monthly" or "weekly".' },
        { status: 400 }
      );
    }

    // Fetch price data
    const days = config.yearsAgo * 365;
    const priceData = await fetchPrices(asset, days);

    // Calculate investment results
    const result = calculateInvestment(config, priceData);

    return NextResponse.json(result);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
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
