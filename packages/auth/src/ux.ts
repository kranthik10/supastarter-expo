export type AuthUxErrorCode =
  | 'invalid_email'
  | 'password_required'
  | 'password_too_short'
  | 'password_mismatch'
  | 'name_required'
  | 'invalid_credentials'
  | 'account_exists'
  | 'invalid_reset_token'
  | 'reset_delivery_unavailable'
  | 'rate_limited'
  | 'network'
  | 'server';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: AuthUxErrorCode };

const MIN_PASSWORD_LENGTH = 8;

export class AuthActionError extends Error {
  constructor(public readonly code: string, message?: string, public readonly status?: number) {
    super(message ?? code);
    this.name = 'AuthActionError';
  }
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateSignInInput(email: string, password: string): ValidationResult<{ email: string; password: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!validateEmail(normalizedEmail)) return { ok: false, code: 'invalid_email' };
  if (!password) return { ok: false, code: 'password_required' };
  return { ok: true, value: { email: normalizedEmail, password } };
}

export function validateSignUpInput(
  name: string,
  email: string,
  password: string
): ValidationResult<{ name: string; email: string; password: string }> {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedName) return { ok: false, code: 'name_required' };
  if (!validateEmail(normalizedEmail)) return { ok: false, code: 'invalid_email' };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, code: 'password_too_short' };
  return { ok: true, value: { name: normalizedName, email: normalizedEmail, password } };
}

export function validateResetPasswordInput(
  token: string,
  password: string,
  confirmation: string
): ValidationResult<{ token: string; password: string }> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return { ok: false, code: 'invalid_reset_token' };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, code: 'password_too_short' };
  if (password !== confirmation) return { ok: false, code: 'password_mismatch' };
  return { ok: true, value: { token: normalizedToken, password } };
}

const AUTH_ERROR_MESSAGE_KEYS: Record<AuthUxErrorCode, string> = {
  invalid_email: 'auth.invalidEmail',
  password_required: 'auth.passwordRequired',
  password_too_short: 'auth.shortPassword',
  password_mismatch: 'auth.passwordMismatch',
  name_required: 'auth.nameRequired',
  invalid_credentials: 'auth.invalidCredentials',
  account_exists: 'auth.accountExists',
  invalid_reset_token: 'auth.invalidResetToken',
  reset_delivery_unavailable: 'auth.resetDeliveryUnavailable',
  rate_limited: 'auth.rateLimited',
  network: 'auth.networkError',
  server: 'auth.serverError',
};

export function authErrorMessageKey(code: AuthUxErrorCode): string {
  return AUTH_ERROR_MESSAGE_KEYS[code];
}

export function classifyAuthError(error: unknown): AuthUxErrorCode {
  if (error instanceof TypeError) return 'network';

  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const status = typeof record?.status === 'number' ? record.status : undefined;
  const rawCode = error instanceof AuthActionError ? error.code : typeof record?.code === 'string' ? record.code : '';
  const code = rawCode.toUpperCase();

  if (status === 429 || code.includes('TOO_MANY')) return 'rate_limited';
  if (code.includes('INVALID_EMAIL_OR_PASSWORD') || code === 'INVALID_PASSWORD' || code === 'INVALID_CREDENTIALS') {
    return 'invalid_credentials';
  }
  if (code.includes('USER_ALREADY_EXISTS') || code.includes('EMAIL_ALREADY_IN_USE')) return 'account_exists';
  if (code.includes('PASSWORD_TOO_SHORT')) return 'password_too_short';
  if (code.includes('INVALID_TOKEN') || code.includes('TOKEN_EXPIRED')) return 'invalid_reset_token';
  if (code.includes('RESET_PASSWORD_DISABLED') || code.includes('EMAIL_NOT_CONFIGURED')) {
    return 'reset_delivery_unavailable';
  }
  if (status !== undefined && status >= 500) return 'server';
  return 'server';
}
