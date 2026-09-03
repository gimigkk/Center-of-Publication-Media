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

export function classifyAuthError(
  error: unknown,
  context: 'login' | 'signup' = 'login'
): {
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
    return {
      code: 'EMAIL_NOT_CONFIRMED',
      message: 'Email akun belum dikonfirmasi.',
      providerStatus,
    };
  }

  if (
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    code.includes('over_request_rate_limit')
  ) {
    return {
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak percobaan. Silakan tunggu beberapa saat.',
      providerStatus,
    };
  }

  if (combined.includes('banned') || combined.includes('disabled')) {
    return {
      code: 'ACCOUNT_DISABLED',
      message: 'Akun ini sedang dinonaktifkan.',
      providerStatus,
    };
  }

  if (
    combined.includes('already registered') ||
    combined.includes('already exists') ||
    combined.includes('user already registered') ||
    code === 'user_already_exists' ||
    code === 'email_exists'
  ) {
    return {
      code: 'EXISTING_ACCOUNT',
      message: 'Email ini sudah terdaftar. Silakan masuk menggunakan akun Anda.',
      providerStatus,
    };
  }

  if (
    combined.includes('invalid login credentials') ||
    code === 'invalid_credentials' ||
    (providerStatus === 400 && combined.includes('credentials'))
  ) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Email atau kata sandi tidak cocok.',
      providerStatus,
    };
  }

  if (
    combined.includes('fetch failed') ||
    combined.includes('network') ||
    combined.includes('failed to fetch') ||
    name.includes('network')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Koneksi ke server gagal. Periksa koneksi internet Anda.',
      providerStatus,
    };
  }

  if (combined.includes('timeout')) {
    return {
      code: 'TIMEOUT',
      message: 'Layanan terlalu lama merespons. Silakan coba lagi.',
      providerStatus,
    };
  }

  if (combined.includes('invalidmimetype') || combined.includes('mime type')) {
    return {
      code: 'INVALID_MIME_TYPE',
      message: 'Format gambar profil tidak didukung oleh penyimpanan.',
      providerStatus,
    };
  }

  return {
    code: context === 'signup' ? 'SIGNUP_ERROR' : 'AUTH_ERROR',
    message:
      context === 'signup'
        ? 'Pendaftaran akun mengalami kendala sistem. Silakan coba beberapa saat lagi.'
        : 'Login gagal karena kesalahan autentikasi. Silakan coba lagi.',
    providerStatus,
  };
}

export const classifyLoginError = classifyAuthError;
