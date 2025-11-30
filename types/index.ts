export interface InvestmentConfig {
  asset: 'bitcoin' | 'tesla';
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
