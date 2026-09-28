import { NextResponse } from 'next/server';

// 간단한 메모리 캐시 (서버 재시작 시 초기화됨)
let cachedRates: { rates: Record<string, number>; cachedDate: string } | null = null;

// finance.naver.com HTML(410) 대신 stock API JSON 사용 (USDTSignal과 동일)
const NAVER_FX_BASE = 'https://api.stock.naver.com/marketindex/exchange';

// Handle OPTIONS for CORS preflight
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

function parseNaverPrice(raw: unknown): number | null {
  const rate = parseFloat(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** 최신 고시 환율. `calcPrice`가 없으면 `closePrice`. */
async function fetchLatestNaverRate(code: string): Promise<number | null> {
  try {
    const response = await fetch(`${NAVER_FX_BASE}/${code}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`Naver FX ${code}: HTTP ${response.status}`);
      return null;
    }

    const info = (await response.json())?.exchangeInfo;
    return parseNaverPrice(info?.calcPrice) ?? parseNaverPrice(info?.closePrice);
  } catch (error) {
    console.error(`Failed to fetch rate from ${code}:`, error);
    return null;
  }
}

export async function GET() {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // 캐시 확인 (같은 날이면 캐시 사용)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (cachedRates && cachedRates.cachedDate === today) {
      return NextResponse.json(
        {
          success: true,
          rates: cachedRates.rates,
          cachedDate: cachedRates.cachedDate,
        },
        { headers: corsHeaders }
      );
    }

    // 네이버에서 각 환율 가져오기
    const [usdKrw, jpyKrw, cnyKrw] = await Promise.all([
      fetchLatestNaverRate('FX_USDKRW'),
      fetchLatestNaverRate('FX_JPYKRW'),
      fetchLatestNaverRate('FX_CNYKRW'),
    ]);

    // 모든 환율을 가져오지 못하면 에러
    if (!usdKrw || !jpyKrw || !cnyKrw) {
      throw new Error('Failed to fetch one or more exchange rates from Naver');
    }

    // USD 기준으로 변환
    // 네이버에서 가져온 값들:
    // - USD/KRW = usdKrw (1 USD = usdKrw KRW)
    // - JPY/KRW = jpyKrw (fullName "일본 JPY 100" → 100 JPY = jpyKrw KRW)
    // - CNY/KRW = cnyKrw (1 CNY = cnyKrw KRW)

    const jpyPerKrw = jpyKrw / 100;
    const cnyPerKrw = cnyKrw;

    const rates = {
      KRW: usdKrw, // 1 USD = KRW (원)
      JPY: usdKrw / jpyPerKrw, // 1 USD = JPY (엔)
      CNY: usdKrw / cnyPerKrw, // 1 USD = CNY (위안)
    };

    // 캐시 업데이트 (오늘 날짜 저장)
    cachedRates = {
      rates,
      cachedDate: today,
    };

    return NextResponse.json(
      {
        success: true,
        rates,
        cachedDate: cachedRates.cachedDate,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);

    // 실패 시 에러 반환
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch exchange rates',
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}
