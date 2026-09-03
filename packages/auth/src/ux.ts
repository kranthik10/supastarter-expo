export type AuthUxErrorCode =
  | 'invalid_email'
  | 'password_required'
  | 'current_password_required'
  | 'current_password_incorrect'
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

export type AuthUxOperation = 'sign-in' | 'sign-up' | 'change-password' | 'reset-password';

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

export function validateProfileNameInput(name: string): ValidationResult<{ name: string }> {
  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, code: 'name_required' };
  return { ok: true, value: { name: normalizedName } };
}

export function validateChangePasswordInput(
  currentPassword: string,
  newPassword: string
): ValidationResult<{ currentPassword: string; newPassword: string }> {
  if (!currentPassword) return { ok: false, code: 'current_password_required' };
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, code: 'password_too_short' };
  return { ok: true, value: { currentPassword, newPassword } };
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
  current_password_required: 'auth.currentPasswordRequired',
  current_password_incorrect: 'auth.currentPasswordIncorrect',
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

/**
 * Resolves any account-screen failure to a finite localized message key.
 * Authentication-shaped failures (AuthActionError, validation codes, network
 * TypeErrors, status-carrying errors) resolve to auth keys. All other failures
 * resolve to the caller-provided generic fallback so raw backend, database,
 * and transport text is never rendered.
 */
export function resolveErrorMessageKey(
  error: unknown,
  operation?: AuthUxOperation,
  fallbackKey = 'auth.serverError'
): string {
  if (error instanceof AuthActionError || error instanceof TypeError) {
    return authErrorMessageKey(classifyAuthError(error, operation));
  }
  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  if (record && (typeof record.code === 'string' || typeof record.status === 'number')) {
    return authErrorMessageKey(classifyAuthError(error, operation));
  }
  return fallbackKey;
}

export function classifyAuthError(error: unknown, operation?: AuthUxOperation): AuthUxErrorCode {
  if (error instanceof TypeError) return 'network';

  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const status = typeof record?.status === 'number' ? record.status : undefined;
  const rawCode = error instanceof AuthActionError ? error.code : typeof record?.code === 'string' ? record.code : '';
  // Client-side validation codes are already finite user-facing codes; pass them through untouched.
  // Object.hasOwn (not `in`) so prototype-chain names can never slip through as UX codes.
  if (Object.hasOwn(AUTH_ERROR_MESSAGE_KEYS, rawCode)) return rawCode as AuthUxErrorCode;
  const code = rawCode.toUpperCase();

  if (status === 429 || code.includes('TOO_MANY')) return 'rate_limited';
  if (code === 'INVALID_PASSWORD' && operation === 'change-password') return 'current_password_incorrect';
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
