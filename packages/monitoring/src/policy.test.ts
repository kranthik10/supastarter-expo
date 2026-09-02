import { describe, expect, it } from 'vitest';
import {
  isExpectedMonitoringErrorCode,
  sanitizeMonitoringContext,
  sanitizeMonitoringError,
  sanitizeMonitoringRoute,
  sanitizeServerRequestContext,
} from './policy';

describe('monitoring policy', () => {
  it('redacts forbidden keys at every nesting level', () => {
    const safe = sanitizeMonitoringContext({
      operation: 'upload',
      password: 'secret',
      nested: { authorization: 'Bearer raw', kept: 'ok' },
      uploadUrl: 'https://signed.example/?X-Amz-Signature=raw',
      requestBody: { email: 'user@example.com' },
    });

    expect(safe).toMatchObject({
      operation: 'upload',
      password: '[REDACTED]',
      nested: { authorization: '[REDACTED]', kept: 'ok' },
      uploadUrl: '[REDACTED]',
      requestBody: '[REDACTED]',
    });
    expect(JSON.stringify(safe)).not.toContain('raw');
  });

  it('redacts sensitive values from error messages and stacks', () => {
    const safe = sanitizeMonitoringError(new Error('request https://signed.example/file?token=raw-token failed'));
    expect(safe.message).toContain('[REDACTED]');
    expect(safe.message).not.toContain('raw-token');
  });

  it('filters expected business errors but captures unexpected errors', () => {
    expect(isExpectedMonitoringErrorCode('BAD_REQUEST')).toBe(true);
    expect(isExpectedMonitoringErrorCode('FORBIDDEN')).toBe(true);
    expect(isExpectedMonitoringErrorCode('PRECONDITION_FAILED')).toBe(true);
    expect(isExpectedMonitoringErrorCode('INTERNAL_SERVER_ERROR')).toBe(false);
  });

  it('sanitizes client and server routes without query or token values', () => {
    expect(sanitizeMonitoringRoute('/invite/raw-invitation-token?token=secret')).toBe('invite');
    expect(sanitizeMonitoringRoute('/(app)/(tabs)/settings?email=user@example.com')).toBe('settings');
    expect(sanitizeMonitoringRoute('/api/trpc/invitations.accept?token=secret')).toBe('/api/trpc/invitations.accept');
  });

  it('keeps only safe server request metadata', () => {
    expect(sanitizeServerRequestContext({
      method: 'POST',
      route: '/api/trpc/invitations.accept?token=secret',
      procedure: 'invitations.accept',
      status: 500,
      requestId: 'req_123',
      authorization: 'Bearer raw',
      body: { token: 'raw' },
    })).toEqual({
      method: 'POST',
      route: '/api/trpc/invitations.accept',
      procedure: 'invitations.accept',
      status: 500,
      request_id: 'req_123',
    });
  });
});
