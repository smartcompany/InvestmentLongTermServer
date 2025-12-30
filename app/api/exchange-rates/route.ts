import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// 간단한 메모리 캐시 (서버 재시작 시 초기화됨)
let cachedRates: { rates: Record<string, number>; cachedDate: string } | null = null;

// 네이버 환율 페이지 URL (USD 기준으로 KRW 가져오기)
const USD_KRW_URL = 'https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_USDKRW';
const JPY_KRW_URL = 'https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_JPYKRW';
const CNY_KRW_URL = 'https://finance.naver.com/marketindex/exchangeDailyQuote.naver?marketindexCd=FX_CNYKRW';

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

// 네이버 환율 페이지에서 최신 환율 가져오기
async function fetchLatestRateFromNaver(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InvestLongTerm/1.0)',
      },
    });
    
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    // 첫 번째 행(가장 최신 데이터)에서 환율 추출
    const rows = $('table.tbl_exchange tbody tr');
    if (rows.length === 0) {
      return null;
    }
    
    const firstRow = rows.first();
    const tds = firstRow.find('td');
    if (tds.length < 2) {
      return null;
    }
    
    const rateStr = $(tds[1]).text().trim().replace(/,/g, '');
    const rate = parseFloat(rateStr);
    
    return !isNaN(rate) && rate > 0 ? rate : null;
  } catch (error) {
    console.error(`Failed to fetch rate from ${url}:`, error);
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
      fetchLatestRateFromNaver(USD_KRW_URL),
      fetchLatestRateFromNaver(JPY_KRW_URL),
      fetchLatestRateFromNaver(CNY_KRW_URL),
    ]);

    // 모든 환율을 가져오지 못하면 에러
    if (!usdKrw || !jpyKrw || !cnyKrw) {
      throw new Error('Failed to fetch one or more exchange rates from Naver');
    }

    // USD 기준으로 변환
    // 네이버에서 가져온 값들:
    // - USD/KRW = usdKrw (1 USD = usdKrw KRW) ✅
    // - JPY/KRW = jpyKrw (100 JPY = jpyKrw KRW) -> 1 JPY = jpyKrw/100 KRW
    // - CNY/KRW = cnyKrw (1 CNY = cnyKrw KRW) ✅
    
    const jpyPerKrw = jpyKrw / 100; // 100 JPY 기준을 1 JPY 기준으로 변환
    const cnyPerKrw = cnyKrw; // 1 CNY 기준
    
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
