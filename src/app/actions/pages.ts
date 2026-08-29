'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Page } from '@/types';

export async function getPagesAction(): Promise<Page[]> {
  if (!db) return [];
  try {
    const records = await db.select().from(schema.pages);
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error('Failed to get pages from database:', e);
    return [];
  }
}

export async function getPageAction(pageId: string): Promise<Page | null> {
  const pages = await getPagesAction();
  return pages.find((p) => p.id === pageId) || pages[0] || null;
}

export async function createPageAction(
  name: string,
  description?: string,
  userId?: string
): Promise<{ success: boolean; page?: Page; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Nama halaman wajib diisi' };
  }

  if (!db || !userId) {
    return { success: false, error: 'Database belum terhubung atau sesi tidak valid' };
  }

  try {
    const [inserted] = await db
      .insert(schema.pages)
      .values({
        name: trimmed,
        description: description?.trim() || null,
        createdBy: userId,
      })
      .returning();

    revalidatePath('/');
    return {
      success: true,
      page: {
        id: inserted.id,
        name: inserted.name,
        description: inserted.description,
        createdBy: inserted.createdBy,
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }
}

export async function updatePageAction(
  pageId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: 'Nama halaman tidak boleh kosong' };

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    await db
      .update(schema.pages)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(schema.pages.id, pageId));
    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }
}

export async function deletePageAction(pageId: string): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const existing = await db.select().from(schema.pages);
    if (existing.length <= 1) {
      return { success: false, error: 'Tidak dapat menghapus satu-satunya halaman yang tersisa' };
    }

    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }
}

