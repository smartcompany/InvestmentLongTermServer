import { AssetDefinition } from '@/types';
import { fetchPrices, fetchYahooPrices } from '@/lib/priceService';
import assetsData from '@/app/api/assets/assets.json';

const catalog = assetsData as AssetDefinition[];
const CHANGE_THRESHOLD = 0.01;

export type HoldingRow = {
  id: string;
  asset_id: string;
  asset_name: string;
  quantity: number;
  initial_amount: number;
  registered_date: string;
  annual_interest_rate: number;
  symbol: string | null;
  asset_type: string | null;
};

function cashValueAt(params: {
  initialAmount: number;
  annualInterestRate: number;
  registeredDate: Date;
  at: Date;
}): number {
  const { initialAmount, annualInterestRate, registeredDate, at } = params;
  if (at < registeredDate) return initialAmount;
  if (!annualInterestRate) return initialAmount;
  const days = Math.floor(
    (at.getTime() - registeredDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return initialAmount;
  const years = days / 365;
  return initialAmount * Math.pow(1 + annualInterestRate / 100, years);
}

async function latestPriceForHolding(h: HoldingRow): Promise<number | null> {
  if (h.asset_id === 'cash' || h.asset_type === 'cash') {
    return cashValueAt({
      initialAmount: Number(h.initial_amount),
      annualInterestRate: Number(h.annual_interest_rate ?? 0),
      registeredDate: new Date(h.registered_date),
      at: new Date(),
    });
  }

  const catalogAsset = catalog.find((a) => a.id === h.asset_id);
  try {
    if (catalogAsset) {
      const prices = await fetchPrices(catalogAsset, 7);
      if (prices.length === 0) return null;
      return prices[prices.length - 1].price * Number(h.quantity);
    }

    const symbol = h.symbol?.trim();
    if (!symbol) return null;
    const prices = await fetchYahooPrices(symbol, 7);
    if (prices.length === 0) return null;
    return prices[prices.length - 1].price * Number(h.quantity);
  } catch (e) {
    console.error(`[portfolio] price failed for ${h.asset_id}:`, e);
    return null;
  }
}

export async function computePortfolioTotal(
  holdings: HoldingRow[],
): Promise<number | null> {
  if (holdings.length === 0) return 0;

  let total = 0;
  let priced = 0;

  for (const h of holdings) {
    const value = await latestPriceForHolding(h);
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    priced += 1;
  }

  if (priced === 0) return null;
  return total;
}

export function dayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { CHANGE_THRESHOLD };
