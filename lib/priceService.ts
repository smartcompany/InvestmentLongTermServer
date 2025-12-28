import { AssetDefinition, PriceData } from '@/types';

// Simple in-memory cache
const cache = new Map<string, { data: PriceData[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; InvestLongTerm/1.0; +https://vercel.com)',
};

async function fetchYahooPrices(symbol: string, days: number): Promise<PriceData[]> {
  const cacheKey = `${symbol}-${days}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);

    // URL 인코딩 (한국 주식 심볼의 경우 .KS가 제대로 처리되도록)
    const encodedSymbol = encodeURIComponent(symbol);
    
    // Yahoo Finance API
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?period1=${period1}&period2=${period2}&interval=1d`;
    console.log(`Fetching prices for ${symbol} (${encodedSymbol}): ${url}`);
    
    const response = await fetch(url, { headers: YAHOO_HEADERS });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Yahoo Finance API error (${symbol}): ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Yahoo Finance API error (${symbol}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 에러 체크 (Yahoo Finance는 때때로 에러를 200 응답에 포함시킴)
    if (data.chart?.error) {
      console.error(`Yahoo Finance API error (${symbol}):`, data.chart.error);
      throw new Error(`Yahoo Finance API error (${symbol}): ${JSON.stringify(data.chart.error)}`);
    }
    
    const result = data.chart?.result?.[0];
    
    if (!result) {
      console.error(`Yahoo Finance API error (${symbol}): No result in response`, JSON.stringify(data));
      throw new Error(`Yahoo Finance API error (${symbol}): No result in response`);
    }
    
    const timestamps: number[] = result?.timestamp ?? [];
    const closePrices: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

    if (!timestamps.length || !closePrices.length) {
      console.error(`Yahoo Finance API error (${symbol}): missing data`, {
        timestampsLength: timestamps.length,
        closePricesLength: closePrices.length,
        result: result
      });
      throw new Error(`Yahoo Finance API error (${symbol}): missing data (timestamps: ${timestamps.length}, prices: ${closePrices.length})`);
    }

    const prices: PriceData[] = timestamps
      .map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString(),
        price: closePrices[index] ?? NaN,
      }))
      .filter((point) => Number.isFinite(point.price));

    if (prices.length === 0) {
      console.error(`Yahoo Finance API error (${symbol}): No valid prices after filtering`);
      throw new Error(`Yahoo Finance API error (${symbol}): No valid prices`);
    }

    console.log(`Successfully fetched ${prices.length} price points for ${symbol}`);
    cache.set(cacheKey, { data: prices, timestamp: Date.now() });
    return prices;
  } catch (error) {
    console.error(`Error fetching ${symbol} prices:`, error);
    throw error;
  }
}

export function fetchPrices(asset: AssetDefinition, days: number): Promise<PriceData[]> {
  // 현금 자산은 가격 데이터가 없으므로 빈 배열 반환
  if (asset.type === 'cash') {
    return Promise.resolve([]);
  }
  
  if (!asset.symbol) {
    throw new Error(`Asset ${asset.id} is missing a data symbol`);
  }
  return fetchYahooPrices(asset.symbol, days);
}
