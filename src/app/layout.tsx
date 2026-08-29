import type { Metadata } from 'next';
import '@/styles/globals.css';
import '@/styles/header.css';
import '@/styles/board.css';
import '@/styles/card.css';
import '@/styles/toolbar.css';
import '@/styles/modal.css';
import '@/styles/cursors.css';
import '@/styles/archive.css';

export const metadata: Metadata = {
  title: 'COPM - Platform Manajemen Operasional Kreatif',
  description:
    'Ruang kerja kanban kolaboratif real-time untuk pengajuan kreatif, penugasan beban kerja desainer, dan manajemen revisi.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
