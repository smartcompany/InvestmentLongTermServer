import { NextRequest, NextResponse } from 'next/server';
import { AssetDefinition, PriceData } from '@/types';
import { fetchPrices } from '@/lib/priceService';
import assetsData from '../assets/assets.json';

const assets: AssetDefinition[] = assetsData as AssetDefinition[];

function getAssetById(id: string): AssetDefinition | undefined {
  return assets.find((asset) => asset.id === id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { assetId, days } = body;

    if (!assetId) {
      return NextResponse.json(
        { error: 'assetId is required' },
        { status: 400 }
      );
    }

    const asset = getAssetById(assetId);
    if (!asset) {
      return NextResponse.json(
        { error: 'Invalid asset. Please select a supported asset.' },
        { status: 400 }
      );
    }

    // Fetch price data
    const requestedDays = days || 365;
    let priceData: PriceData[] = [];
    
    if (asset.type === 'cash') {
      // 현금 자산은 금리 2.1% 기반으로 가격 데이터 생성
      const totalDays = requestedDays;
      const dailyRate = 0.021 / 365; // 일일 금리
      const basePrice = 100; // 기준 가격
      
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

