import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      backgroundColor: '#F8F9FA',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#1E1E1E',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '72px',
        fontWeight: 800,
        color: '#E5E7EB',
        lineHeight: 1,
        marginBottom: '16px',
      }}>
        404
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>
        Halaman Tidak Ditemukan
      </h1>
      <p style={{ fontSize: '14px', color: '#6B7280', margin: '0 0 24px', maxWidth: '360px' }}>
        Halaman atau rute yang Anda cari tidak tersedia atau telah dipindahkan.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0D99FF',
          color: '#FFFFFF',
          textDecoration: 'none',
          borderRadius: '8px',
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        Kembali ke Workspace
      </Link>
    </div>
  );
}
