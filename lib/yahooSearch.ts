import { AssetDefinition } from '@/types';

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; InvestLongTerm/1.0; +https://vercel.com)',
};

export type AppAssetType = AssetDefinition['type'];

export interface SearchQuoteResult {
  id: string;
  symbol: string;
  name: string;
  type: AppAssetType;
  exchange?: string;
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
}

function sanitizeSymbolForId(symbol: string): string {
  return symbol.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

export function mapYahooQuoteToAppType(quote: YahooQuote): AppAssetType | null {
  const symbol = (quote.symbol ?? '').toUpperCase();
  const quoteType = (quote.quoteType ?? '').toUpperCase();

  if (quoteType === 'CRYPTOCURRENCY') return 'crypto';

  if (quoteType === 'EQUITY' || quoteType === 'ETF') {
    if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) {
      return 'korean_stock';
    }
    return 'stock';
  }

  // Commodity-ish instruments (futures, some currencies)
  if (
    quoteType === 'FUTURE' ||
    quoteType === 'CURRENCY' ||
    symbol.endsWith('=F')
  ) {
    return 'commodity';
  }

  return null;
}

export async function searchYahooQuotes(
  q: string,
  options?: { type?: AppAssetType; lang?: string; limit?: number }
): Promise<SearchQuoteResult[]> {
  const query = q.trim();
  if (!query) return [];

  const limit = options?.limit ?? 12;
  const lang = options?.lang ?? 'en-US';
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', query);
  url.searchParams.set('quotesCount', String(limit));
  url.searchParams.set('newsCount', '0');
  url.searchParams.set('listsCount', '0');
  url.searchParams.set('enableFuzzyQuery', 'false');
  url.searchParams.set('quotesQueryId', 'tss_match_phrase_query');
  url.searchParams.set('lang', lang);

  const response = await fetch(url.toString(), { headers: YAHOO_HEADERS });
  if (!response.ok) {
    throw new Error(`Yahoo search error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const quotes: YahooQuote[] = Array.isArray(data?.quotes) ? data.quotes : [];

  const results: SearchQuoteResult[] = [];
  const seen = new Set<string>();

  for (const quote of quotes) {
    const symbol = quote.symbol?.trim();
    if (!symbol) continue;

    const mappedType = mapYahooQuoteToAppType(quote);
    if (!mappedType) continue;
    if (options?.type && mappedType !== options.type) continue;

    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const name =
      quote.longname?.trim() ||
      quote.shortname?.trim() ||
      symbol;

    results.push({
      id: `custom_${sanitizeSymbolForId(symbol)}`,
      symbol,
      name,
      type: mappedType,
      exchange: quote.exchDisp || quote.exchange,
    });
  }

  return results;
}
