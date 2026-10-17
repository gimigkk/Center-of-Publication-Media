import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createDeliverablePreviewUrl } from '@/lib/r2';
import { isMockEnabled } from '@/lib/mock-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (isMockEnabled()) {
    return NextResponse.redirect(
      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=1600&auto=format&fit=crop&q=80',
      307
    );
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', `/api/deliverables/${id}/view`);
    return NextResponse.redirect(loginUrl, 307);
  }

  if (!db) {
    return new NextResponse('Database unavailable', { status: 503 });
  }

  const [record] = await db
    .select()
    .from(schema.deliverables)
    .where(eq(schema.deliverables.id, id));

  if (!record || record.status !== 'ready') {
    return new NextResponse('Deliverable not found', { status: 404 });
  }

  // Generate on-the-fly signed URL for the original full-res file
  const viewUrl = await createDeliverablePreviewUrl(record.storageKey);

  const response = NextResponse.redirect(viewUrl, 307);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}
