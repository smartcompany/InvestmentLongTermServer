export interface InvestmentConfig {
  asset: string;
  yearsAgo: number;
  amount: number;
  type: 'single' | 'recurring';
  frequency: 'monthly' | 'weekly';
}

export interface DataPoint {
  x: number; // years from start
  y: number; // value in USD
}

export interface CalculationResult {
  totalInvested: number;
  finalValue: number;
  cagr: number;
  yieldRate: number;
  investedSpots: DataPoint[];
  valueSpots: DataPoint[];
}

export interface PriceData {
  date: string;
  price: number;
}

export interface AssetDefinition {
  id: string;
  type: 'crypto' | 'stock' | 'korean_stock' | 'cash' | 'commodity' | 'real_estate';
  symbol: string; // Yahoo Finance symbol, e.g., BTC-USD, TSLA, GC=F (not used for cash)
  icon?: string;
  names: Record<string, string>;
  defaultYearsAgo?: number;
  order?: number;
}
