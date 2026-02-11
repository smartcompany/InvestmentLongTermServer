import { PriceData } from '@/types';

// 아파트 매매가격지수용 통계표 (전국주택가격동향조사)
const APARTMENT_STATBL_ID = 'A_2024_00004';

// 월별 데이터 캐시 (YYYYMM -> price)
const monthlyCache = new Map<string, { price: number; timestamp: number }>();
// 최종 결과 캐시 (days -> PriceData[])
const resultCache = new Map<string, { data: PriceData[]; timestamp: number }>();
const MONTHLY_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days (월별 데이터는 일주일 캐시)
const RESULT_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours (최종 결과는 하루 캐시)

/**
 * 월별 전국 아파트 매매가격지수 데이터 가져오기 (캐시 우선)
 * 전국주택가격동향조사 - 아파트 매매가격지수
 */
async function fetchMonthlyNationalPrice(yyyymm: string): Promise<number | null> {
  const cacheKey = `national-apartment-${yyyymm}`;
  const cached = monthlyCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < MONTHLY_CACHE_TTL) {
    return cached.price;
  }

  const apiKey = process.env.REAL_ESTATE_API_KEY || '';
  if (!apiKey) {
    throw new Error('REAL_ESTATE_API_KEY environment variable is not set');
  }

  try {
    const url = `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=${APARTMENT_STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${yyyymm}&Type=json&KEY=${apiKey}&pSize=1000`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Korean Real Estate API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    // 에러 체크
    const result = data.RESULT || data.SttsApiTblData?.[0]?.head?.[1]?.RESULT;
    if (result && result.CODE && result.CODE.startsWith('ERROR')) {
      console.error(`Korean Real Estate API error: ${result.CODE} ${result.MESSAGE}`);
      return null;
    }

    // 데이터 추출 (전국 아파트 매매가격지수)
    const rows = data.SttsApiTblData?.[1]?.row || [];
    // 전국주택가격동향: 전국 + 아파트 + 매매가격지수 우선, 없으면 전국만
    const nationalData =
      rows.find((row: any) => {
        const nm = `${row.CLS_NM || ''} ${row.CLS_FULLNM || ''} ${row.OBJ_NM || ''} ${row.GRP_NM || ''} ${row.ITM_NM || ''}`;
        return (row.CLS_NM === '전국' || (row.CLS_FULLNM || '').endsWith('전국')) && nm.includes('아파트') && nm.includes('매매');
      }) ||
      rows.find((row: any) => row.CLS_NM === '전국');
    
    if (nationalData && nationalData.DTA_VAL) {
      const indexValue = parseFloat(nationalData.DTA_VAL);
      if (!isNaN(indexValue) && isFinite(indexValue)) {
        monthlyCache.set(cacheKey, { price: indexValue, timestamp: Date.now() });
        return indexValue;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Korean Real Estate data for ${yyyymm}:`, error);
    return null;
  }
}

/**
 * 한국부동산원 API에서 월별 아파트 매매가격지수 데이터 가져오기 (전국)
 */
async function fetchKoreanRealEstatePrices(days: number): Promise<PriceData[]> {
  const resultCacheKey = `korean-apartment-${days}`;
  const cached = resultCache.get(resultCacheKey);

  if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TTL) {
    return cached.data;
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 조회할 월 목록 생성 (yyyymm, year, month)
    const monthsToFetch: { yyyymm: string; year: number; month: number }[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      monthsToFetch.push({
        yyyymm: `${year}${String(month + 1).padStart(2, '0')}`,
        year,
        month,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // 모든 월을 병렬로 조회 (캐시된 월은 즉시 반환, 나머지만 실제 fetch)
    const results = await Promise.all(
      monthsToFetch.map(({ yyyymm }) => fetchMonthlyNationalPrice(yyyymm))
    );

    const prices: PriceData[] = [];
    results.forEach((indexValue, i) => {
      if (indexValue !== null) {
        const { year, month } = monthsToFetch[i];
        prices.push({
          date: new Date(year, month, 1).toISOString(),
          price: indexValue,
        });
      }
    });

    if (prices.length === 0) {
      throw new Error('No valid Korean apartment price data found');
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

    console.log(`Successfully fetched ${filteredPrices.length} Korean apartment price points`);
    resultCache.set(resultCacheKey, { data: filteredPrices, timestamp: Date.now() });
    return filteredPrices;
  } catch (error) {
    console.error(`Error fetching Korean Real Estate prices:`, error);
    throw error;
  }
}

/**
 * 월별 서울 구 평균 아파트 매매가격지수 데이터 가져오기 (캐시 우선)
 * 전국주택가격동향조사 - 아파트 매매가격지수 (서울 시군구)
 */
async function fetchMonthlySeoulPrice(yyyymm: string): Promise<number | null> {
  const cacheKey = `seoul-apartment-${yyyymm}`;
  const cached = monthlyCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < MONTHLY_CACHE_TTL) {
    return cached.price;
  }

  const apiKey = process.env.REAL_ESTATE_API_KEY || '';
  if (!apiKey) {
    throw new Error('REAL_ESTATE_API_KEY environment variable is not set');
  }

  try {
    const url = `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=${APARTMENT_STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${yyyymm}&Type=json&KEY=${apiKey}&pSize=2000`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Seoul Real Estate API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    const result = data.RESULT || data.SttsApiTblData?.[0]?.head?.[1]?.RESULT;
    if (result && result.CODE && result.CODE.startsWith('ERROR')) {
      console.error(`Seoul Real Estate API error: ${result.CODE} ${result.MESSAGE}`);
      return null;
    }

    const rows = data.SttsApiTblData?.[1]?.row || [];
    // 서울 구 데이터 (서울>구 형태, 아파트 매매 우선)
    const targetRows = rows.filter((row: any) => {
      const fullnm = (row.CLS_FULLNM || '').trim();
      const nm = `${row.OBJ_NM || ''} ${row.GRP_NM || ''} ${row.ITM_NM || ''}`;
      const isSeoulGu = fullnm.startsWith('서울>') && fullnm.split('>').length === 2;
      return isSeoulGu;
    });
    
    if (targetRows.length > 0) {
      const values = targetRows
        .map((row: any) => parseFloat(row.DTA_VAL))
        .filter((val: number) => !isNaN(val) && isFinite(val));
      if (values.length > 0) {
        const indexValue = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
        monthlyCache.set(cacheKey, { price: indexValue, timestamp: Date.now() });
        return indexValue;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Seoul Real Estate data for ${yyyymm}:`, error);
    return null;
  }
}

/**
 * 한국부동산원 API에서 월별 아파트 매매가격지수 데이터 가져오기 (서울 구 평균)
 */
async function fetchSeoulRealEstatePrices(days: number): Promise<PriceData[]> {
  const resultCacheKey = `seoul-apartment-${days}`;
  const cached = resultCache.get(resultCacheKey);

  if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TTL) {
    return cached.data;
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const monthsToFetch: { yyyymm: string; year: number; month: number }[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      monthsToFetch.push({
        yyyymm: `${year}${String(month + 1).padStart(2, '0')}`,
        year,
        month,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    const results = await Promise.all(
      monthsToFetch.map(({ yyyymm }) => fetchMonthlySeoulPrice(yyyymm))
    );

    const prices: PriceData[] = [];
    results.forEach((indexValue, i) => {
      if (indexValue !== null) {
        const { year, month } = monthsToFetch[i];
        prices.push({
          date: new Date(year, month, 1).toISOString(),
          price: indexValue,
        });
      }
    });

    if (prices.length === 0) {
      throw new Error('No valid Seoul apartment price data found');
    }

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

    console.log(`Successfully fetched ${filteredPrices.length} Seoul apartment price points`);
    resultCache.set(resultCacheKey, { data: filteredPrices, timestamp: Date.now() });
    return filteredPrices;
  } catch (error) {
    console.error(`Error fetching Seoul Real Estate prices:`, error);
    throw error;
  }
}

export { fetchKoreanRealEstatePrices, fetchSeoulRealEstatePrices };
