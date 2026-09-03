import { describe, expect, it } from 'vitest';
import {
  AuthActionError,
  authErrorMessageKey,
  classifyAuthError,
  validateResetPasswordInput,
  validateSignInInput,
  validateSignUpInput,
} from './ux';

describe('authentication UX policy', () => {
  it('validates sign-in fields before network submission', () => {
    expect(validateSignInInput('invalid', 'secret12')).toEqual({ ok: false, code: 'invalid_email' });
    expect(validateSignInInput('user@example.com', '')).toEqual({ ok: false, code: 'password_required' });
    expect(validateSignInInput(' user@example.com ', 'secret12')).toEqual({
      ok: true,
      value: { email: 'user@example.com', password: 'secret12' },
    });
  });

  it('validates signup fields and normalizes safe text values', () => {
    expect(validateSignUpInput('', 'user@example.com', 'secret12')).toEqual({ ok: false, code: 'name_required' });
    expect(validateSignUpInput('Ada', 'invalid', 'secret12')).toEqual({ ok: false, code: 'invalid_email' });
    expect(validateSignUpInput('Ada', 'user@example.com', 'short')).toEqual({ ok: false, code: 'password_too_short' });
    expect(validateSignUpInput(' Ada ', ' USER@example.com ', 'secret12')).toEqual({
      ok: true,
      value: { name: 'Ada', email: 'user@example.com', password: 'secret12' },
    });
  });

  it('validates reset token and matching passwords without exposing the token', () => {
    expect(validateResetPasswordInput('', 'secret12', 'secret12')).toEqual({ ok: false, code: 'invalid_reset_token' });
    expect(validateResetPasswordInput('opaque-token', 'short', 'short')).toEqual({ ok: false, code: 'password_too_short' });
    expect(validateResetPasswordInput('opaque-token', 'secret12', 'different')).toEqual({ ok: false, code: 'password_mismatch' });
    expect(validateResetPasswordInput(' opaque-token ', 'secret12', 'secret12')).toEqual({
      ok: true,
      value: { token: 'opaque-token', password: 'secret12' },
    });
  });

  it('maps Better Auth, HTTP, and network failures to finite user-facing codes', () => {
    expect(classifyAuthError(new AuthActionError('INVALID_EMAIL_OR_PASSWORD'))).toBe('invalid_credentials');
    expect(classifyAuthError(new AuthActionError('USER_ALREADY_EXISTS'))).toBe('account_exists');
    expect(classifyAuthError(new AuthActionError('INVALID_TOKEN'))).toBe('invalid_reset_token');
    expect(classifyAuthError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyAuthError({ status: 503 })).toBe('server');
    expect(classifyAuthError(new Error('unknown implementation detail'))).toBe('server');
  });

  it('maps every finite UX error to a stable localized message key', () => {
    expect(authErrorMessageKey('invalid_email')).toBe('auth.invalidEmail');
    expect(authErrorMessageKey('password_required')).toBe('auth.passwordRequired');
    expect(authErrorMessageKey('password_too_short')).toBe('auth.shortPassword');
    expect(authErrorMessageKey('password_mismatch')).toBe('auth.passwordMismatch');
    expect(authErrorMessageKey('name_required')).toBe('auth.nameRequired');
    expect(authErrorMessageKey('invalid_credentials')).toBe('auth.invalidCredentials');
    expect(authErrorMessageKey('account_exists')).toBe('auth.accountExists');
    expect(authErrorMessageKey('invalid_reset_token')).toBe('auth.invalidResetToken');
    expect(authErrorMessageKey('reset_delivery_unavailable')).toBe('auth.resetDeliveryUnavailable');
    expect(authErrorMessageKey('rate_limited')).toBe('auth.rateLimited');
    expect(authErrorMessageKey('network')).toBe('auth.networkError');
    expect(authErrorMessageKey('server')).toBe('auth.serverError');
  });
});
