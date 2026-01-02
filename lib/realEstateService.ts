import { PriceData } from '@/types';

// Simple in-memory cache
const cache = new Map<string, { data: PriceData[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours (월별 데이터이므로 하루 캐시)

/**
 * 한국부동산원 API에서 월별 지가지수 데이터 가져오기 (전국)
 */
async function fetchKoreanRealEstatePrices(days: number): Promise<PriceData[]> {
  const cacheKey = `korean-real-estate-${days}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const apiKey = process.env.REAL_ESTATE_API_KEY || '';
    if (!apiKey) {
      throw new Error('REAL_ESTATE_API_KEY environment variable is not set');
    }

    // 시작일 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prices: PriceData[] = [];
    const currentDate = new Date(startDate);

    // 월별 데이터를 순회하면서 가져오기
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const yyyymm = `${year}${month}`;

      try {
        const url = `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=A_2024_00901&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${yyyymm}&Type=json&KEY=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Korean Real Estate API error: ${response.status} ${response.statusText}`);
          // 에러가 나도 다음 달 시도
          currentDate.setMonth(currentDate.getMonth() + 1);
          continue;
        }

        const data = await response.json();
        
        // 에러 체크
        const result = data.RESULT || data.SttsApiTblData?.[0]?.head?.[1]?.RESULT;
        if (result && result.CODE && result.CODE.startsWith('ERROR')) {
          console.error(`Korean Real Estate API error: ${result.CODE} ${result.MESSAGE}`);
          currentDate.setMonth(currentDate.getMonth() + 1);
          continue;
        }

        // 데이터 추출 (전국 데이터)
        const rows = data.SttsApiTblData?.[1]?.row || [];
        const nationalData = rows.find((row: any) => row.CLS_NM === '전국');
        
        if (nationalData && nationalData.DTA_VAL) {
          const indexValue = parseFloat(nationalData.DTA_VAL);
          if (!isNaN(indexValue) && isFinite(indexValue)) {
            // 해당 월의 첫날을 날짜로 사용
            const date = new Date(year, currentDate.getMonth(), 1);
            prices.push({
              date: date.toISOString(),
              price: indexValue,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching Korean Real Estate data for ${yyyymm}:`, error);
      }

      // 다음 달로 이동
      currentDate.setMonth(currentDate.getMonth() + 1);
      
      // API 호출 제한을 고려한 지연
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (prices.length === 0) {
      throw new Error('No valid Korean Real Estate price data found');
    }

    // 날짜순 정렬
    prices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 월별 데이터를 일별 데이터로 보간 (선형 보간)
    const interpolatedPrices: PriceData[] = [];
    for (let i = 0; i < prices.length; i++) {
      const current = prices[i];
      const next = prices[i + 1];
      
      // 현재 월의 첫날 추가
      interpolatedPrices.push({
        date: current.date,
        price: current.price,
      });

      // 다음 월이 있으면 그 사이를 보간
      if (next) {
        const currentDate = new Date(current.date);
        const nextDate = new Date(next.date);
        const daysBetween = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // 중간 날짜들에 보간된 값 추가
        for (let day = 1; day < daysBetween; day++) {
          const interpolatedDate = new Date(currentDate);
          interpolatedDate.setDate(interpolatedDate.getDate() + day);
          
          // 선형 보간
          const ratio = day / daysBetween;
          const interpolatedPrice = current.price + (next.price - current.price) * ratio;
          
          interpolatedPrices.push({
            date: interpolatedDate.toISOString(),
            price: interpolatedPrice,
          });
        }
      } else {
        // 마지막 월이면 해당 월의 나머지 날짜도 같은 값으로 채우기
        const currentDate = new Date(current.date);
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        
        for (let day = 2; day <= daysInMonth; day++) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          if (date <= endDate) {
            interpolatedPrices.push({
              date: date.toISOString(),
              price: current.price,
            });
          }
        }
      }
    }

    // 요청된 기간 내의 데이터만 필터링
    const filteredPrices = interpolatedPrices.filter(p => {
      const priceDate = new Date(p.date);
      return priceDate >= startDate && priceDate <= endDate;
    });

    console.log(`Successfully fetched ${filteredPrices.length} Korean Real Estate price points`);
    cache.set(cacheKey, { data: filteredPrices, timestamp: Date.now() });
    return filteredPrices;
  } catch (error) {
    console.error(`Error fetching Korean Real Estate prices:`, error);
    throw error;
  }
}

/**
 * 한국부동산원 API에서 월별 지가지수 데이터 가져오기 (서울 구 평균)
 */
async function fetchSeoulRealEstatePrices(days: number): Promise<PriceData[]> {
  const cacheKey = `seoul-real-estate-${days}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const apiKey = process.env.REAL_ESTATE_API_KEY || '';
    if (!apiKey) {
      throw new Error('REAL_ESTATE_API_KEY environment variable is not set');
    }

    // 시작일 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prices: PriceData[] = [];
    const currentDate = new Date(startDate);

    // 월별 데이터를 순회하면서 가져오기
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const yyyymm = `${year}${month}`;

      try {
        const url = `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=A_2024_00901&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${yyyymm}&Type=json&KEY=${apiKey}&pSize=1000`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Seoul Real Estate API error: ${response.status} ${response.statusText}`);
          // 에러가 나도 다음 달 시도
          currentDate.setMonth(currentDate.getMonth() + 1);
          continue;
        }

        const data = await response.json();
        
        // 에러 체크
        const result = data.RESULT || data.SttsApiTblData?.[0]?.head?.[1]?.RESULT;
        if (result && result.CODE && result.CODE.startsWith('ERROR')) {
          console.error(`Seoul Real Estate API error: ${result.CODE} ${result.MESSAGE}`);
          currentDate.setMonth(currentDate.getMonth() + 1);
          continue;
        }

        // 데이터 추출 (서울 구 평균)
        const rows = data.SttsApiTblData?.[1]?.row || [];
        
        // 서울 구 데이터 찾기 (서울>구 형태, 한 단계만 깊이)
        const seoulGuData = rows.filter((row: any) => {
          const fullnm = row.CLS_FULLNM || '';
          return fullnm.startsWith('서울>') && fullnm.split('>').length === 2;
        });
        
        if (seoulGuData.length > 0) {
          // 서울 구들의 평균 계산
          const values = seoulGuData
            .map((row: any) => parseFloat(row.DTA_VAL))
            .filter((val: number) => !isNaN(val) && isFinite(val));
          
          if (values.length > 0) {
            const indexValue = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
            // 해당 월의 첫날을 날짜로 사용
            const date = new Date(year, currentDate.getMonth(), 1);
            prices.push({
              date: date.toISOString(),
              price: indexValue,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching Seoul Real Estate data for ${yyyymm}:`, error);
      }

      // 다음 달로 이동
      currentDate.setMonth(currentDate.getMonth() + 1);
      
      // API 호출 제한을 고려한 지연
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (prices.length === 0) {
      throw new Error('No valid Seoul Real Estate price data found');
    }

    // 날짜순 정렬
    prices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 월별 데이터를 일별 데이터로 보간 (선형 보간)
    const interpolatedPrices: PriceData[] = [];
    for (let i = 0; i < prices.length; i++) {
      const current = prices[i];
      const next = prices[i + 1];
      
      // 현재 월의 첫날 추가
      interpolatedPrices.push({
        date: current.date,
        price: current.price,
      });

      // 다음 월이 있으면 그 사이를 보간
      if (next) {
        const currentDate = new Date(current.date);
        const nextDate = new Date(next.date);
        const daysBetween = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // 중간 날짜들에 보간된 값 추가
        for (let day = 1; day < daysBetween; day++) {
          const interpolatedDate = new Date(currentDate);
          interpolatedDate.setDate(interpolatedDate.getDate() + day);
          
          // 선형 보간
          const ratio = day / daysBetween;
          const interpolatedPrice = current.price + (next.price - current.price) * ratio;
          
          interpolatedPrices.push({
            date: interpolatedDate.toISOString(),
            price: interpolatedPrice,
          });
        }
      } else {
        // 마지막 월이면 해당 월의 나머지 날짜도 같은 값으로 채우기
        const currentDate = new Date(current.date);
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        
        for (let day = 2; day <= daysInMonth; day++) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          if (date <= endDate) {
            interpolatedPrices.push({
              date: date.toISOString(),
              price: current.price,
            });
          }
        }
      }
    }

    // 요청된 기간 내의 데이터만 필터링
    const filteredPrices = interpolatedPrices.filter(p => {
      const priceDate = new Date(p.date);
      return priceDate >= startDate && priceDate <= endDate;
    });

    console.log(`Successfully fetched ${filteredPrices.length} Seoul Real Estate price points`);
    cache.set(cacheKey, { data: filteredPrices, timestamp: Date.now() });
    return filteredPrices;
  } catch (error) {
    console.error(`Error fetching Seoul Real Estate prices:`, error);
    throw error;
  }
}

export { fetchKoreanRealEstatePrices, fetchSeoulRealEstatePrices };
