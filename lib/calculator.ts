import { InvestmentConfig, CalculationResult, DataPoint, PriceData } from '@/types';

export function calculateInvestment(
  config: InvestmentConfig,
  priceData: PriceData[]
): CalculationResult {
  const { amount, type, frequency } = config;

  // Sort prices by date
  const sortedPrices = [...priceData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedPrices.length === 0) {
    throw new Error('No price data available');
  }

  const startPrice = sortedPrices[0].price;
  const endPrice = sortedPrices[sortedPrices.length - 1].price;
  const totalDays = sortedPrices.length;
  const totalYears = totalDays / 365;

  let totalInvested = 0;
  let currentValue = 0;
  const investedSpots: DataPoint[] = [];
  const valueSpots: DataPoint[] = [];

  if (type === 'single') {
    // Single lump sum investment
    totalInvested = amount;
    currentValue = (amount / startPrice) * endPrice;

    // Generate spots for chart
    sortedPrices.forEach((pricePoint, index) => {
      const years = (index / totalDays) * totalYears;
      const value = (amount / startPrice) * pricePoint.price;
      investedSpots.push({ x: years, y: totalInvested });
      valueSpots.push({ x: years, y: value });
    });
  } else {
    // Recurring investment (DCA - Dollar Cost Averaging)
    const periodsPerYear = frequency === 'monthly' ? 12 : 52;
    const totalPeriods = Math.floor(totalYears * periodsPerYear);
    const perPeriodAmount = amount / totalPeriods;
    const daysPerPeriod = totalDays / totalPeriods;

    let shares = 0;

    for (let period = 0; period < totalPeriods; period++) {
      const dayIndex = Math.floor(period * daysPerPeriod);
      if (dayIndex >= sortedPrices.length) break;

      const priceAtPurchase = sortedPrices[dayIndex].price;
      const sharesBought = perPeriodAmount / priceAtPurchase;
      shares += sharesBought;
      totalInvested += perPeriodAmount;

      const years = (dayIndex / totalDays) * totalYears;
      const currentPriceAtThisPoint = sortedPrices[dayIndex].price;
      const valueAtThisPoint = shares * currentPriceAtThisPoint;

      investedSpots.push({ x: years, y: totalInvested });
      valueSpots.push({ x: years, y: valueAtThisPoint });
    }

    // Final value
    currentValue = shares * endPrice;

    // Add final data point
    investedSpots.push({ x: totalYears, y: totalInvested });
    valueSpots.push({ x: totalYears, y: currentValue });
  }

  // Calculate metrics
  const yieldRate = ((currentValue - totalInvested) / totalInvested) * 100;
  const cagr = (Math.pow(currentValue / totalInvested, 1 / totalYears) - 1) * 100;

  return {
    totalInvested,
    finalValue: currentValue,
    cagr,
    yieldRate,
    investedSpots,
    valueSpots,
  };
}
