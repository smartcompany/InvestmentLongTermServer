import { NextRequest, NextResponse } from 'next/server';
import { AppAssetType, searchYahooQuotes } from '@/lib/yahooSearch';

const ALLOWED_TYPES: AppAssetType[] = [
  'crypto',
  'stock',
  'korean_stock',
  'commodity',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? '';
    const typeParam = searchParams.get('type') ?? undefined;
    const lang = searchParams.get('lang') ?? undefined;

    if (!q.trim()) {
      return NextResponse.json(
        { error: 'q is required' },
        { status: 400 }
      );
    }

    let type: AppAssetType | undefined;
    if (typeParam) {
      if (!ALLOWED_TYPES.includes(typeParam as AppAssetType)) {
        return NextResponse.json(
          { error: 'Invalid type. Allowed: crypto, stock, korean_stock, commodity' },
          { status: 400 }
        );
      }
      type = typeParam as AppAssetType;
    }

    const results = await searchYahooQuotes(q, { type, lang, limit: 12 });
    return NextResponse.json(results);
  } catch (error) {
    console.error('Asset search API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
