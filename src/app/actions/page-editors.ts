'use server';

import { db, schema } from '@/lib/db';
import { eq, inArray, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Profile } from '@/types';
import { requireAdmin } from '@/lib/auth-guard';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function getPageEditorsAction(pageId: string): Promise<string[]> {
  if (isMockEnabled()) {
    const store = getMockStore();
    return (store as unknown as { pageEditors?: { pageId: string; editorId: string }[] })
      .pageEditors?.filter((pe) => pe.pageId === pageId)
      .map((pe) => pe.editorId) || [];
  }

  if (!db) return [];
  try {
    const rows = await db
      .select({ editorId: schema.pageEditors.editorId })
      .from(schema.pageEditors)
      .where(eq(schema.pageEditors.pageId, pageId));
    return rows.map((r) => r.editorId);
  } catch (e) {
    console.error('Failed to get page editors:', e);
    return [];
  }
}

export async function getPageDesignerSuggestionsAction(
  pageId: string
): Promise<{ designer: Profile; activeWipCount: number }[]> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const mockStorePe = (store as unknown as { pageEditors?: { pageId: string; editorId: string }[] }).pageEditors;
    const assignedIds = new Set(
      mockStorePe?.filter((pe) => pe.pageId === pageId).map((pe) => pe.editorId) || []
    );

    const designers = store.users.filter(
      (u) =>
        u.isApproved &&
        (u.role === 'designer' || u.role === 'admin') &&
        (assignedIds.size === 0 || assignedIds.has(u.id))
    );

    return designers.map((d) => {
      const wipCount = store.jobs.filter(
        (j) =>
          !j.isArchived &&
          (j.status === 'wip' || j.status === 'revisions') &&
          (j.designerId === d.id || j.designerIds?.includes(d.id))
      ).length;
      return { designer: d, activeWipCount: wipCount };
    });
  }

  if (!db) return [];

  try {
    const [editorRows, allUsersRecords, workloadRows] = await Promise.all([
      db
        .select({ editorId: schema.pageEditors.editorId })
        .from(schema.pageEditors)
        .where(eq(schema.pageEditors.pageId, pageId)),
      db
        .select({
          id: schema.profiles.id,
          email: schema.profiles.email,
          fullName: schema.profiles.fullName,
          phoneNumber: schema.profiles.phoneNumber,
          avatarUrl: schema.profiles.avatarUrl,
          role: schema.profiles.role,
          divisionId: schema.profiles.divisionId,
          isApproved: schema.profiles.isApproved,
          createdAt: schema.profiles.createdAt,
          updatedAt: schema.profiles.updatedAt,
        })
        .from(schema.profiles),
      db.execute(sql`
        SELECT designer_id, count(*)::int AS active_wip_count
        FROM (
          SELECT designer_id FROM jobs
          WHERE status IN ('wip', 'revisions') AND is_archived = false AND designer_id IS NOT NULL
          UNION ALL
          SELECT jd.designer_id FROM job_designers jd
          JOIN jobs j ON j.id = jd.job_id
          WHERE j.status IN ('wip', 'revisions') AND j.is_archived = false
        ) combined_designers
        GROUP BY designer_id;
      `),
    ]);

    const wipCountMap = new Map<string, number>();
    for (const row of workloadRows as unknown as { designer_id: string; active_wip_count: number }[]) {
      wipCountMap.set(String(row.designer_id), Number(row.active_wip_count));
    }

    const assignedIds = new Set(editorRows.map((r) => r.editorId));

    const allUsers: Profile[] = allUsersRecords.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      phoneNumber: r.phoneNumber,
      avatarUrl: r.avatarUrl,
      role: r.role,
      divisionId: r.divisionId,
      isApproved: r.isApproved,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    // If page has assigned editors, restrict to them. Otherwise fallback to all approved designers/admins
    const designers = allUsers.filter(
      (u) =>
        u.isApproved &&
        (u.role === 'designer' || u.role === 'admin') &&
        (assignedIds.size === 0 || assignedIds.has(u.id))
    );

    const suggestions = designers.map((d) => ({
      designer: d,
      activeWipCount: wipCountMap.get(d.id) || 0,
    }));

    suggestions.sort((a, b) => a.activeWipCount - b.activeWipCount);
    return suggestions;
  } catch (e) {
    console.error('Failed to get page designer suggestions:', e);
    return [];
  }
}

export async function updatePageEditorsAction(
  pageId: string,
  editorIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  if (isMockEnabled()) {
    const store = getMockStore() as unknown as {
      pageEditors?: { id: string; pageId: string; editorId: string; assignedAt: string }[];
    };
    if (!store.pageEditors) store.pageEditors = [];
    store.pageEditors = store.pageEditors.filter((pe) => pe.pageId !== pageId);
    for (const editorId of editorIds) {
      store.pageEditors.push({
        id: `pe-${Date.now()}-${Math.random()}`,
        pageId,
        editorId,
        assignedAt: new Date().toISOString(),
      });
    }
    return { success: true };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    await db.transaction(async (tx) => {
      // Delete existing assignments for this page
      await tx.delete(schema.pageEditors).where(eq(schema.pageEditors.pageId, pageId));

      // Insert new assignments if any
      if (editorIds.length > 0) {
        await tx.insert(schema.pageEditors).values(
          editorIds.map((editorId) => ({
            pageId,
            editorId,
          }))
        );
      }
    });

    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    console.error('Failed to update page editors:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memperbarui editor halaman' };
  }
}
