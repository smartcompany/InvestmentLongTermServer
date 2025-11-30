import { PriceData } from '@/types';

// Simple in-memory cache
const cache = new Map<string, { data: PriceData[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function fetchBitcoinPrices(days: number): Promise<PriceData[]> {
  const cacheKey = `bitcoin-${days}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // CoinGecko API - free, no API key needed
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const data = await response.json();
    const prices: PriceData[] = data.prices.map((item: [number, number]) => ({
      date: new Date(item[0]).toISOString(),
      price: item[1],
    }));

    cache.set(cacheKey, { data: prices, timestamp: Date.now() });
    return prices;
  } catch (error) {
    console.error('Error fetching Bitcoin prices:', error);
    throw error;
  }
}

export async function fetchTeslaPrices(days: number): Promise<PriceData[]> {
  const cacheKey = `tesla-${days}`;
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
      `https://query1.finance.yahoo.com/v8/finance/chart/TSLA?period1=${period1}&period2=${period2}&interval=1d`
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const closePrices = result.indicators.quote[0].close;

    const prices: PriceData[] = timestamps.map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString(),
      price: closePrices[index],
    }));

    cache.set(cacheKey, { data: prices, timestamp: Date.now() });
    return prices;
  } catch (error) {
    console.error('Error fetching Tesla prices:', error);
    throw error;
  }
}

export async function fetchPrices(asset: 'bitcoin' | 'tesla', days: number): Promise<PriceData[]> {
  if (asset === 'bitcoin') {
    return fetchBitcoinPrices(days);
  } else {
    return fetchTeslaPrices(days);
  }
}
