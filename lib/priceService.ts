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

    // Yahoo Finance API
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`,
      { headers: YAHOO_HEADERS }
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error (${symbol}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closePrices: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

    if (!timestamps.length || !closePrices.length) {
      throw new Error(`Yahoo Finance API error (${symbol}): missing data`);
    }

    const prices: PriceData[] = timestamps
      .map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString(),
        price: closePrices[index] ?? NaN,
      }))
      .filter((point) => Number.isFinite(point.price));

    cache.set(cacheKey, { data: prices, timestamp: Date.now() });
    return prices;
  } catch (error) {
    console.error(`Error fetching ${symbol} prices:`, error);
    throw error;
  }
}

export function fetchPrices(asset: AssetDefinition, days: number): Promise<PriceData[]> {
  if (!asset.symbol) {
    throw new Error(`Asset ${asset.id} is missing a data symbol`);
  }
  return fetchYahooPrices(asset.symbol, days);
}
