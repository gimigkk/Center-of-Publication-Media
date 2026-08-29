'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Division } from '@/types';

export async function getDivisionsAction(): Promise<Division[]> {
  if (!db) return [];
  try {
    const records = await db.select().from(schema.divisions);
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
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Nama divisi tidak boleh kosong' };
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
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: 'Nama divisi tidak boleh kosong' };

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
  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    await db.delete(schema.divisions).where(eq(schema.divisions.id, id));
    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Tidak dapat menghapus divisi yang memiliki job aktif' };
  }
}

