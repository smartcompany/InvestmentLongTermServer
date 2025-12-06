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
  const startDate = new Date(sortedPrices[0].date);
  const endDate = new Date(sortedPrices[sortedPrices.length - 1].date);
  // 실제 날짜 차이를 밀리초로 계산하고 일수로 변환
  const actualDaysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const totalYears = actualDaysDiff / 365;
  const totalDays = sortedPrices.length; // 차트용 데이터 포인트 수

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

    // Pre-calculate all investments
    const investments: { dayIndex: number; shares: number; invested: number }[] = [];
    let cumulativeShares = 0;
    let cumulativeInvested = 0;

    for (let period = 0; period < totalPeriods; period++) {
      const dayIndex = Math.floor(period * daysPerPeriod);
      if (dayIndex >= sortedPrices.length) break;

      const priceAtPurchase = sortedPrices[dayIndex].price;
      const sharesBought = perPeriodAmount / priceAtPurchase;
      cumulativeShares += sharesBought;
      cumulativeInvested += perPeriodAmount;

      investments.push({
        dayIndex,
        shares: cumulativeShares,
        invested: cumulativeInvested,
      });
    }

    // Generate data points for all days
    let investmentIndex = 0;
    sortedPrices.forEach((pricePoint, index) => {
      const years = (index / totalDays) * totalYears;

      // Find the investment state at this day
      while (
        investmentIndex < investments.length - 1 &&
        investments[investmentIndex + 1].dayIndex <= index
      ) {
        investmentIndex++;
      }

      const currentShares =
        investmentIndex < investments.length ? investments[investmentIndex].shares : 0;
      const currentInvested =
        investmentIndex < investments.length ? investments[investmentIndex].invested : 0;

      const valueAtThisPoint = currentShares * pricePoint.price;

      investedSpots.push({ x: years, y: currentInvested });
      valueSpots.push({ x: years, y: valueAtThisPoint });
    });

    // Final values
    totalInvested = cumulativeInvested;
    currentValue = cumulativeShares * endPrice;
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
