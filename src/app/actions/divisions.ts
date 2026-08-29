'use server';

import { db, schema } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Division } from '@/types';
import { requireAdmin } from '@/lib/auth-guard';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function getDivisionsAction(): Promise<Division[]> {
  if (isMockEnabled()) {
    return [...getMockStore().divisions].sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    );
  }

  if (!db) return [];
  try {
    const records = await db
      .select()
      .from(schema.divisions)
      .orderBy(asc(schema.divisions.name));

    return records.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error('Failed to get divisions:', e);
    return [];
  }
}

export async function createDivisionAction(name: string): Promise<{ success: boolean; division?: Division; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Nama divisi tidak boleh kosong' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const newDiv: Division = {
      id: `div-${Date.now()}`,
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
      .values({ name: trimmed })
      .returning();

    revalidatePath('/');
    return {
      success: true,
      division: {
        id: inserted.id,
        name: inserted.name,
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Kesalahan database';
    return { success: false, error: msg };
  }
}

export async function updateDivisionAction(id: string, name: string): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: e instanceof Error ? e.message : 'Tidak dapat menghapus divisi yang memiliki job aktif' };
  }
}
