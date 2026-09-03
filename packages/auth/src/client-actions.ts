import { AuthActionError } from './ux';

type BetterAuthErrorLike = {
  code?: unknown;
  status?: unknown;
};

type BetterAuthResult = {
  data?: { status?: unknown } | null;
  error?: BetterAuthErrorLike | null;
};

type BetterAuthInvokeClient = {
  $invoke: (
    path: string,
    options?: { method?: string; body?: Record<string, unknown> }
  ) => Promise<BetterAuthResult>;
};

export { AuthActionError } from './ux';

export function toAuthActionError(error: unknown, fallbackCode = 'AUTH_ACTION_FAILED'): AuthActionError {
  const value = typeof error === 'object' && error !== null ? (error as BetterAuthErrorLike) : null;
  const code = typeof value?.code === 'string' && value.code.length > 0 ? value.code : fallbackCode;
  const status = typeof value?.status === 'number' ? value.status : undefined;
  return new AuthActionError(code, 'Authentication action failed', status);
}

export function createPasswordResetActions(client: BetterAuthInvokeClient) {
  return {
    async requestPasswordReset(email: string, redirectTo: string): Promise<{ requested: true }> {
      const result = await client.$invoke('/request-password-reset', {
        method: 'POST',
        body: { email, redirectTo },
      });
      if (result.error) throw toAuthActionError(result.error, 'PASSWORD_RESET_REQUEST_FAILED');
      if (result.data?.status !== true) throw new AuthActionError('PASSWORD_RESET_REQUEST_FAILED');
      return { requested: true };
    },

    async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
      const result = await client.$invoke('/reset-password', {
        method: 'POST',
        body: { token, newPassword },
      });
      if (result.error) throw toAuthActionError(result.error, 'PASSWORD_RESET_FAILED');
      if (result.data?.status !== true) throw new AuthActionError('PASSWORD_RESET_FAILED');
      return { reset: true };
    },
  };
}
