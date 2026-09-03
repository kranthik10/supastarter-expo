import { describe, expect, it, vi } from 'vitest';
import { AuthActionError, createPasswordResetActions, toAuthActionError } from './client-actions';

describe('Better Auth password reset client actions', () => {
  it('requests a real Better Auth reset without returning reset credentials', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: true, message: 'accepted' }, error: null });
    const actions = createPasswordResetActions({ $invoke: invoke });

    await expect(actions.requestPasswordReset('user@example.com', 'mobile-saas://reset-password')).resolves.toEqual({
      requested: true,
    });
    expect(invoke).toHaveBeenCalledWith('/request-password-reset', {
      method: 'POST',
      body: { email: 'user@example.com', redirectTo: 'mobile-saas://reset-password' },
    });
  });

  it('submits the opaque token only to the Better Auth reset endpoint', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: true }, error: null });
    const actions = createPasswordResetActions({ $invoke: invoke });

    await expect(actions.resetPassword('opaque-reset-token', 'new-secret12')).resolves.toEqual({ reset: true });
    expect(invoke).toHaveBeenCalledWith('/reset-password', {
      method: 'POST',
      body: { token: 'opaque-reset-token', newPassword: 'new-secret12' },
    });
  });

  it('preserves finite Better Auth error codes without leaking reset tokens', () => {
    const error = toAuthActionError({ code: 'INVALID_TOKEN', message: 'Token opaque-reset-token is invalid', status: 400 });
    expect(error).toBeInstanceOf(AuthActionError);
    expect(error.code).toBe('INVALID_TOKEN');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Authentication action failed');
    expect(error.message).not.toContain('opaque-reset-token');
  });
});
