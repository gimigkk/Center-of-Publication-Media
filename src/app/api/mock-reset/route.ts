import { NextResponse } from 'next/server';
import { resetMockStore, isMockEnabled } from '@/lib/mock-store';

export async function GET() {
  if (isMockEnabled()) {
    resetMockStore();
    return NextResponse.json({ success: true, message: 'Mock store reset' });
  }
  return NextResponse.json({ success: false, message: 'Mock not enabled' });
}
