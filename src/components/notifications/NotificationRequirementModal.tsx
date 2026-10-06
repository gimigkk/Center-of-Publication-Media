'use client';

import React from 'react';
import { Bell, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useWebPush } from '@/hooks/useWebPush';

interface NotificationRequirementModalProps {
  userId?: string;
}

export function NotificationRequirementModal({ userId }: NotificationRequirementModalProps) {
  const { isSupported, permission, isSubscribed, loading, subscribe } = useWebPush(userId);

  // If push isn't supported (ancient browser), or already subscribed and granted, don't show
  if (!isSupported || !userId) return null;
  if (isSubscribed && permission === 'granted') return null;

  const isBlocked = permission === 'denied';

  return (
    <Modal
      isOpen={true}
      onClose={() => {}} // Non-closable: required modal
      maxWidth={440}
      showCloseButton={false}
      showHeader={false}
    >
      <div style={{ padding: '28px 24px 20px', textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: isBlocked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(13, 153, 255, 0.12)',
            color: isBlocked ? '#ef4444' : '#0d99ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          {isBlocked ? <AlertTriangle size={28} /> : <Bell size={28} />}
        </div>

        <h3
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary, #1e1e1e)',
            marginBottom: '8px',
            letterSpacing: '-0.3px',
          }}
        >
          {isBlocked ? 'Izin Notifikasi Diblokir' : 'Wajib Mengaktifkan Notifikasi'}
        </h3>

        <p
          style={{
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--text-secondary, #666)',
            marginBottom: '24px',
          }}
        >
          {isBlocked ? (
            <>
              Browser Anda memblokir notifikasi COPM. Untuk melanjutkan kolaborasi, klik ikon <strong>gembok / pengaturan situs</strong> di address bar browser Anda, ubah <strong>Notifikasi</strong> menjadi <strong>Izinkan</strong>, lalu muat ulang halaman.
            </>
          ) : (
            <>
              Untuk memastikan setiap update status job, penugasan editor, dan deadline tersampaikan seketika tanpa tertinggal, notifikasi browser <strong>wajib diaktifkan</strong>.
            </>
          )}
        </p>

        {isBlocked ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
          >
            Sudah Saya Izinkan, Muat Ulang Halaman
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={subscribe}
            disabled={loading}
            style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
          >
            {loading ? 'Mengaktifkan...' : 'Aktifkan Notifikasi Sekarang'}
          </button>
        )}
      </div>
    </Modal>
  );
}
