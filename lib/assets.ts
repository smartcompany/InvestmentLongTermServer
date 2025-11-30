import { AssetDefinition } from '@/types';

export const assets: AssetDefinition[] = [
  {
    id: 'bitcoin',
    type: 'crypto',
    symbol: 'BTC-USD',
    icon: '🪙',
    defaultYearsAgo: 5,
    order: 1,
    names: {
      en: 'Bitcoin',
      ko: '비트코인',
      zh: '比特币',
      ja: 'ビットコイン',
    },
  },
  {
    id: 'ethereum',
    type: 'crypto',
    symbol: 'ETH-USD',
    icon: '💎',
    defaultYearsAgo: 5,
    order: 2,
    names: {
      en: 'Ethereum',
      ko: '이더리움',
      zh: '以太坊',
      ja: 'イーサリアム',
    },
  },
  {
    id: 'tesla',
    type: 'stock',
    symbol: 'TSLA',
    icon: '⚡',
    order: 3,
    names: {
      en: 'Tesla',
      ko: '테슬라',
      zh: '特斯拉',
      ja: 'テスラ',
    },
  },
  {
    id: 'google',
    type: 'stock',
    symbol: 'GOOGL',
    icon: '🔎',
    order: 4,
    names: {
      en: 'Google',
      ko: '구글',
      zh: '谷歌',
      ja: 'グーグル',
    },
  },
];

export function getAssetById(id: string): AssetDefinition | undefined {
  return assets.find((asset) => asset.id === id);
}

