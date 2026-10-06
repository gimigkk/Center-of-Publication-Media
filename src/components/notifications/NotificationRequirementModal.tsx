'use client';

import React from 'react';
import { Bell, AlertTriangle, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useWebPush } from '@/hooks/useWebPush';

interface NotificationRequirementModalProps {
  userId?: string;
}

export function NotificationRequirementModal({ userId }: NotificationRequirementModalProps) {
  const { isSupported, permission, loading, subscribe } = useWebPush(userId);

  // If already granted, allow entry immediately
  if (!isSupported || !userId || permission === 'granted') {
    return null;
  }

  const isBlocked = permission === 'denied';

  return (
    <Modal
      isOpen={true}
      onClose={() => {}}
      title={isBlocked ? 'Izin Notifikasi Diblokir' : 'Aktifkan Notifikasi'}
      subtitle="Pemberitahuan perubahan status dan penugasan job secara real-time"
      maxWidth={480}
      showCloseButton={false}
      footer={
        isBlocked ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Muat Ulang Halaman
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={subscribe}
            disabled={loading}
          >
            <Bell size={13} />
            <span>{loading ? 'Mengaktifkan...' : 'Izinkan Notifikasi'}</span>
          </button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isBlocked ? (
          <>
            <div className="modal-alert-error">
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>
                Browser memblokir izin notifikasi untuk situs ini.
              </span>
            </div>

            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--text-secondary, #475569)',
                lineHeight: 1.55,
                background: '#f8fafc',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                borderRadius: '6px',
                padding: '12px 14px',
              }}
            >
              Untuk membuka akses board:
              <ol style={{ margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Klik ikon <strong>setelan situs / gembok</strong> di sebelah URL address bar browser.</li>
                <li>Ubah setelan <strong>Notifikasi</strong> menjadi <strong>Izinkan (Allow)</strong>.</li>
                <li>Klik tombol <strong>Muat Ulang Halaman</strong> di bawah.</li>
              </ol>
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: '12.5px',
              color: 'var(--text-secondary, #475569)',
              lineHeight: 1.55,
              background: '#f8fafc',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              borderRadius: '6px',
              padding: '12px 14px',
            }}
          >
            <p style={{ margin: 0, marginBottom: '8px' }}>
              COPM mewajibkan notifikasi browser agar update tim (pemindahan status tiket, penugasan editor, revisi brief) tersampaikan langsung ke desktop Anda.
            </p>
            <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-tertiary, #64748b)' }}>
              Klik tombol <strong>Izinkan Notifikasi</strong> di bawah, lalu pilih <strong>Allow</strong> pada dialog konfirmasi browser Anda.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
