import { NextRequest, NextResponse } from 'next/server';
import { AssetDefinition, PriceData } from '@/types';
import { fetchPrices, fetchYahooPrices } from '@/lib/priceService';
import assetsData from '../assets/assets.json';

const assets: AssetDefinition[] = assetsData as AssetDefinition[];

function getAssetById(id: string): AssetDefinition | undefined {
  return assets.find((asset) => asset.id === id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId, symbol, type, days } = body;

    if (!assetId && !symbol) {
      return NextResponse.json(
        { error: 'assetId or symbol is required' },
        { status: 400 }
      );
    }

    const requestedDays = days || 365;
    let priceData: PriceData[] = [];

    const asset = assetId ? getAssetById(assetId) : undefined;

    if (asset) {
      if (asset.type === 'cash') {
        // 현금 자산은 금리 2.1% 기반으로 가격 데이터 생성
        const totalDays = requestedDays;
        const dailyRate = 0.021 / 365;
        const basePrice = 100;

        priceData = Array.from({ length: totalDays }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (totalDays - i));
          const daysPassed = i;
          const price = basePrice * Math.pow(1 + dailyRate, daysPassed);
          return {
            date: date.toISOString(),
            price: price,
          };
        });
      } else {
        priceData = await fetchPrices(asset, requestedDays);
      }
    } else {
      // 카탈로그에 없는 커스텀 종목: symbol로 Yahoo 직접 조회
      const yahooSymbol = typeof symbol === 'string' ? symbol.trim() : '';
      if (!yahooSymbol) {
        return NextResponse.json(
          {
            error:
              'Invalid asset. Provide a catalog assetId or a Yahoo Finance symbol.',
          },
          { status: 400 }
        );
      }

      // type is accepted for future use / client contract; cash/real_estate not supported via symbol
      if (type === 'cash' || type === 'real_estate') {
        return NextResponse.json(
          { error: 'Custom cash/real_estate prices are not supported via symbol' },
          { status: 400 }
        );
      }

      priceData = await fetchYahooPrices(yahooSymbol, requestedDays);
    }

    return NextResponse.json(priceData);
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
