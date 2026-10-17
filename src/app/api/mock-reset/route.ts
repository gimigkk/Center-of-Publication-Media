import { NextResponse } from 'next/server';
import { resetMockStore, isMockEnabled } from '@/lib/mock-store';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  if (isMockEnabled()) {
    resetMockStore();
    return NextResponse.json({ success: true, message: 'Mock store reset' });
  }
  return NextResponse.json({ success: false, message: 'Mock not enabled' }, { status: 400 });
}

export async function GET() {
  return new NextResponse('Method Not Allowed. Use POST.', { status: 405 });
}
