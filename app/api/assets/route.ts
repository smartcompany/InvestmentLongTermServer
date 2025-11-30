import { NextResponse } from 'next/server';
import { assets } from '@/lib/assets';

export async function GET() {
  const sorted = [...assets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return NextResponse.json(sorted);
}

