import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordResetEmailHandler,
  getInvitationEmailProvider,
  getPasswordResetEmailProvider,
  setInvitationEmailProvider,
  setPasswordResetEmailProvider,
} from './email';

describe('invitation email provider seam', () => {
  it('defaults to explicit not-configured delivery without blocking persistence', async () => {
    setInvitationEmailProvider(null);
    const result = await getInvitationEmailProvider().sendInvitation({
      to: 'person@example.com',
      organizationName: 'Acme',
      token: 'token-for-test',
    });
    expect(result).toEqual({ delivered: false, status: 'not_configured' });
  });

  it('reports configured provider delivery separately', async () => {
    setInvitationEmailProvider({
      sendInvitation: async () => ({ delivered: true, status: 'sent' }),
    });
    const result = await getInvitationEmailProvider().sendInvitation({
      to: 'person@example.com',
      organizationName: 'Acme',
      token: 'token-for-test',
    });
    expect(result).toEqual({ delivered: true, status: 'sent' });
    setInvitationEmailProvider(null);
  });
});

describe('password reset email provider seam', () => {
  it('defaults to explicit not-configured delivery while accepting a Better Auth reset request', async () => {
    setPasswordResetEmailProvider(null);
    const result = await getPasswordResetEmailProvider().sendPasswordReset({
      to: 'person@example.com',
      url: 'mobile-saas://reset-password?token=redacted-by-test',
      token: 'redacted-by-test',
    });
    expect(result).toEqual({ delivered: false, status: 'not_configured' });
  });

  it('supports a server-only configured reset delivery provider', async () => {
    setPasswordResetEmailProvider({
      sendPasswordReset: async () => ({ delivered: true, status: 'sent' }),
    });
    const result = await getPasswordResetEmailProvider().sendPasswordReset({
      to: 'person@example.com',
      url: 'mobile-saas://reset-password?token=redacted-by-test',
      token: 'redacted-by-test',
    });
    expect(result).toEqual({ delivered: true, status: 'sent' });
    setPasswordResetEmailProvider(null);
  });

  it('never lets provider failures make reset-request responses account-dependent', async () => {
    setPasswordResetEmailProvider({ sendPasswordReset: vi.fn().mockRejectedValue(new Error('provider down')) });

    await expect(
      createPasswordResetEmailHandler()({
        user: { email: 'safe@example.com' },
        url: 'https://api.example.com/api/auth/reset-password/token',
        token: 'secret-token',
      })
    ).resolves.toBeUndefined();
  });

  it('adapts Better Auth reset input to the server-only email seam', async () => {
    let received: unknown;
    const handler = createPasswordResetEmailHandler({
      sendPasswordReset: async (input) => {
        received = input;
        return { delivered: false, status: 'not_configured' };
      },
    });

    await handler({
      user: { email: 'person@example.com' },
      url: 'mobile-saas://reset-password?token=opaque',
      token: 'opaque',
    });

    expect(received).toEqual({
      to: 'person@example.com',
      url: 'mobile-saas://reset-password?token=opaque',
      token: 'opaque',
    });
  });
});
