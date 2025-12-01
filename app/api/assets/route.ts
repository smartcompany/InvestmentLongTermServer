import { NextResponse } from 'next/server';
import assetsData from './assets.json';
import { AssetDefinition } from '@/types';

const assets: AssetDefinition[] = assetsData as AssetDefinition[];

export async function GET() {
  const sorted = [...assets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return NextResponse.json(sorted);
}

