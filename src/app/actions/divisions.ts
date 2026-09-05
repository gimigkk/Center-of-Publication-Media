'use server';

import { db, schema } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Division } from '@/types';
import { requireAdmin } from '@/lib/auth-guard';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { EVENT_DIVISION_TEMPLATES, KABINET_DIVISION_TEMPLATES } from '@/lib/division-templates';

export async function getDivisionsAction(pageId?: string): Promise<Division[]> {
  if (isMockEnabled()) {
    const list = getMockStore().divisions;
    const filtered = pageId ? list.filter((d) => d.pageId === pageId) : list;
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    );
  }

  if (!db) return [];
  try {
    const query = db
      .select()
      .from(schema.divisions);

    const records = pageId
      ? await query.where(eq(schema.divisions.pageId, pageId)).orderBy(asc(schema.divisions.name))
      : await query.orderBy(asc(schema.divisions.name));

    return records.map((r) => ({
      id: r.id,
      pageId: r.pageId,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error('Failed to get divisions:', e);
    return [];
  }
}

export async function createDivisionAction(
  pageId: string,
  name: string
): Promise<{ success: boolean; division?: Division; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Nama divisi tidak boleh kosong' };
  }
  if (!pageId) {
    return { success: false, error: 'ID halaman / kepanitiaan tidak valid' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const existing = store.divisions.find(
      (d) => d.pageId === pageId && d.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      return { success: false, error: 'Divisi dengan nama tersebut sudah ada di halaman ini' };
    }

    const newDiv: Division = {
      id: `div-${Date.now()}`,
      pageId,
      name: trimmed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.divisions.push(newDiv);
    return { success: true, division: newDiv };
  }

  if (!db) {
    return { success: false, error: 'Database belum terhubung' };
  }

  try {
    const [inserted] = await db
      .insert(schema.divisions)
      .values({
        pageId,
        name: trimmed,
      })
      .returning();

    revalidatePath('/');
    return {
      success: true,
      division: {
        id: inserted.id,
        pageId: inserted.pageId,
        name: inserted.name,
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Kesalahan database';
    if (msg.includes('unique') || msg.includes('divisions_page_name_idx')) {
      return { success: false, error: 'Divisi dengan nama tersebut sudah ada di halaman ini' };
    }
    return { success: false, error: msg };
  }
}

export async function createDefaultDivisionsAction(
  pageId: string,
  template: 'event' | 'kabinet'
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const names = template === 'kabinet' ? KABINET_DIVISION_TEMPLATES : EVENT_DIVISION_TEMPLATES;

  if (isMockEnabled()) {
    const store = getMockStore();
    let count = 0;
    for (const name of names) {
      const exists = store.divisions.some(
        (d) => d.pageId === pageId && d.name.toLowerCase() === name.toLowerCase()
      );
      if (!exists) {
        store.divisions.push({
          id: `div-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageId,
          name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    }
    return { success: true, count };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const existing = await db
      .select({ name: schema.divisions.name })
      .from(schema.divisions)
      .where(eq(schema.divisions.pageId, pageId));

    const existingSet = new Set(existing.map((e) => e.name.toLowerCase()));
    const toInsert = names.filter((n) => !existingSet.has(n.toLowerCase()));

    if (toInsert.length > 0) {
      await db.insert(schema.divisions).values(
        toInsert.map((name) => ({
          pageId,
          name,
        }))
      );
    }

    revalidatePath('/');
    return { success: true, count: toInsert.length };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memuat template divisi' };
  }
}

export async function updateDivisionAction(
  id: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: 'Nama divisi tidak boleh kosong' };

  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.divisions.find((d) => d.id === id);
    if (target) {
      target.name = trimmed;
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Divisi tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    await db
      .update(schema.divisions)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(schema.divisions.id, id));
    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }
}

export async function deleteDivisionAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    store.divisions = store.divisions.filter((d) => d.id !== id);
    return { success: true };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    await db.delete(schema.divisions).where(eq(schema.divisions.id, id));
    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Tidak dapat menghapus divisi yang memiliki job aktif',
    };
  }
}
