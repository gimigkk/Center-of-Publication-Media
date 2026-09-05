'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Page } from '@/types';
import { requireAdmin } from '@/lib/auth-guard';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { createDefaultDivisionsAction } from './divisions';
import { EVENT_DIVISION_TEMPLATES, KABINET_DIVISION_TEMPLATES } from '@/lib/division-templates';

export async function getPagesAction(): Promise<Page[]> {
  if (isMockEnabled()) {
    return getMockStore().pages;
  }

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
  userId?: string,
  divisionTemplate: 'event' | 'kabinet' | 'none' = 'event'
): Promise<{ success: boolean; page?: Page; error?: string }> {
  try {
    const admin = await requireAdmin();
    userId = admin.id;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Nama halaman wajib diisi' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const newPageId = `page-${Date.now()}`;
    const newPage: Page = {
      id: newPageId,
      name: trimmed,
      description: description?.trim() || null,
      createdBy: userId || 'mock-user-admin-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.pages.push(newPage);

    if (divisionTemplate !== 'none') {
      const templateNames = divisionTemplate === 'kabinet' ? KABINET_DIVISION_TEMPLATES : EVENT_DIVISION_TEMPLATES;
      templateNames.forEach((divName, idx) => {
        store.divisions.push({
          id: `div-${Date.now()}-${idx}`,
          pageId: newPageId,
          name: divName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    }

    return { success: true, page: newPage };
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

    if (divisionTemplate !== 'none') {
      try {
        await createDefaultDivisionsAction(inserted.id, divisionTemplate);
      } catch (err) {
        console.warn('Could not auto-seed divisions for new page:', err);
      }
    }

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
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: 'Nama halaman tidak boleh kosong' };

  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.pages.find((p) => p.id === pageId);
    if (target) {
      target.name = trimmed;
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Halaman tidak ditemukan' };
  }

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
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    if (store.pages.length <= 1) {
      return { success: false, error: 'Tidak dapat menghapus satu-satunya halaman yang tersisa' };
    }
    store.pages = store.pages.filter((p) => p.id !== pageId);
    return { success: true };
  }

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
