import { describe, expect, it } from 'vitest';
import { FakeMonitoringProvider, createMonitoring } from './index';
import {
  SentryServerMonitoringProvider,
  captureServerException,
  getServerMonitoring,
} from './server';

describe('server monitoring integration', () => {
  it('captures unexpected errors with safe request context', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider);

    captureServerException(monitoring, new Error('database failed'), {
      code: 'INTERNAL_SERVER_ERROR',
      method: 'POST',
      route: '/api/trpc/invitations.accept?token=secret',
      procedure: 'invitations.accept',
      status: 500,
      requestId: 'req_123',
      authorization: 'Bearer raw',
      body: { token: 'raw' },
    });

    expect(provider.exceptions).toHaveLength(1);
    expect(provider.exceptions[0].context).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      method: 'POST',
      route: '/api/trpc/invitations.accept',
      procedure: 'invitations.accept',
      status: 500,
      request_id: 'req_123',
    });
  });

  it('does not capture expected business errors', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider);

    for (const code of ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'PRECONDITION_FAILED']) {
      captureServerException(monitoring, new Error(code), { code, procedure: 'settings.getProfile' });
    }

    expect(provider.exceptions).toHaveLength(0);
  });

  it('falls back safely without a server DSN', () => {
    const monitoring = getServerMonitoring({});
    expect(() => monitoring.captureException(new Error('not configured'))).not.toThrow();
  });

  it('sends a Sentry event through the configured server DSN', async () => {
    let request: { url: string; body: string } | null = null;
    const provider = new SentryServerMonitoringProvider({
      dsn: 'https://public@example.ingest.sentry.io/123',
      release: 'mobile@1.0.0',
      environment: 'test',
      request: async (url, init) => {
        request = { url, body: init.body };
        return { ok: true };
      },
    });

    await provider.captureException({ name: 'Error', message: 'boom', stack: 'Error: boom' }, { operation: 'read' });
    expect(request).not.toBeNull();
    const captured = request as unknown as { url: string; body: string };
    expect(captured.url).toBe('https://example.ingest.sentry.io/api/123/store/?sentry_version=7&sentry_key=public');
    expect(captured.body).toContain('boom');
    expect(captured.body).toContain('mobile@1.0.0');
    expect(captured.body).not.toContain('authorization');
  });
});
