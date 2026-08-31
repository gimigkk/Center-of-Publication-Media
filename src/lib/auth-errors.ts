interface ErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function toErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== 'object') return {};
  return error as ErrorLike;
}

export function classifyLoginError(error: unknown): {
  code: string;
  message: string;
  providerStatus?: number;
} {
  const details = toErrorLike(error);
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : '';
  const name = typeof details.name === 'string' ? details.name.toLowerCase() : '';
  const providerMessage = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const providerStatus = typeof details.status === 'number' ? details.status : undefined;
  const combined = `${code} ${name} ${providerMessage}`;

  if (combined.includes('email not confirmed') || combined.includes('email_not_confirmed')) {
    return { code: 'EMAIL_NOT_CONFIRMED', message: 'Email akun belum dikonfirmasi di Supabase.', providerStatus };
  }
  if (combined.includes('rate limit') || combined.includes('too many requests') || code.includes('over_request_rate_limit')) {
    return { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan login. Coba lagi beberapa saat.', providerStatus };
  }
  if (combined.includes('banned') || combined.includes('disabled')) {
    return { code: 'ACCOUNT_DISABLED', message: 'Akun ini sedang dinonaktifkan.', providerStatus };
  }
  if (combined.includes('invalid login credentials') || code === 'invalid_credentials' || (providerStatus === 400 && combined.includes('credentials'))) {
    return { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi tidak cocok.', providerStatus };
  }
  if (combined.includes('fetch failed') || combined.includes('network') || combined.includes('failed to fetch') || name.includes('network')) {
    return { code: 'NETWORK_ERROR', message: 'Layanan login tidak dapat dijangkau. Periksa koneksi internet.', providerStatus };
  }
  if (combined.includes('timeout')) {
    return { code: 'TIMEOUT', message: 'Layanan login terlalu lama merespons. Coba lagi.', providerStatus };
  }
  return { code: 'AUTH_ERROR', message: 'Login gagal karena kesalahan autentikasi. Coba lagi atau hubungi administrator.', providerStatus };
}
