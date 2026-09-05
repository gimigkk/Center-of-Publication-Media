import { z } from 'zod';

// Google Docs only URL regex
export const GOOGLE_DOCS_REGEX = /^https:\/\/docs\.google\.com\/document\/(d\/[a-zA-Z0-9-_]+|u\/\d+\/d\/[a-zA-Z0-9-_]+)/;

// Standard brief template URL for requesters to copy & fill
export const BRIEF_TEMPLATE_URL =
  'https://docs.google.com/document/d/1ixdNU2R3edRer37ElOobDLvvKpiw3BmeqXKwUElp6Fg/edit?usp=sharing';

export const jobFormSchema = z.object({
  title: z.string().min(3, 'Judul job minimal harus 3 karakter').max(120, 'Judul job terlalu panjang'),
  description: z.string().optional(),
  briefLink: z
    .string()
    .url('Harus berupa URL yang valid')
    .refine(
      (url) => GOOGLE_DOCS_REGEX.test(url.trim()),
      'Hanya link Google Docs yang diterima (contoh: https://docs.google.com/document/d/...)'
    ),
  divisionId: z.string().min(1, 'Silakan pilih divisi Requester'),
  publicationMedia: z.string().min(2, 'Harap tentukan format media publikasi (contoh: Post Instagram, Banner, Cetak)'),
  deadline: z
    .string()
    .refine((dateStr) => {
      const deadlineDate = new Date(dateStr);
      if (isNaN(deadlineDate.getTime())) return false;

      const now = new Date();
      const minDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Aturan baku H-7
      minDeadline.setHours(0, 0, 0, 0);

      return deadlineDate >= minDeadline;
    }, 'Deadline minimal 7 hari ke depan (Aturan baku: minimal H-7)'),
  pageId: z.string().min(1, 'ID Halaman wajib diisi'),
});

export const signupSchema = z.object({
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter'),
  email: z.string().email('Harap masukkan alamat email yang valid'),
  phoneNumber: z.string().trim().min(1, 'Nomor WhatsApp / HP wajib diisi'),
  role: z.enum(['requestor', 'designer'] as const),
  divisionId: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
});


export const loginSchema = z.object({
  email: z.string().email('Harap masukkan alamat email yang valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

export const pageFormSchema = z.object({
  name: z.string().min(2, 'Nama halaman minimal 2 karakter').max(60, 'Nama halaman terlalu panjang'),
  description: z.string().max(200, 'Deskripsi terlalu panjang').optional(),
});

export const divisionFormSchema = z.object({
  name: z.string().min(2, 'Nama divisi minimal 2 karakter').max(60, 'Nama divisi terlalu panjang'),
});
