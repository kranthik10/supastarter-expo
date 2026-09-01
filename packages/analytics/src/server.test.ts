import { describe, expect, it } from 'vitest';
import { NoopServerAnalyticsProvider, PostHogServerAnalyticsProvider, getServerAnalyticsProvider } from './server';

describe('server analytics providers', () => {
  it('sends server events through the configured PostHog endpoint', async () => {
    let request: { url: string; body: string } | null = null;
    const provider = new PostHogServerAnalyticsProvider({
      apiKey: 'server-test-key',
      host: 'https://analytics.example.com',
      request: async (url, init) => {
        request = { url, body: init.body };
        return { ok: true };
      },
    });
    await provider.capture('organization_created', { organization_id: 'org_123' });
    expect(request).not.toBeNull();
    const captured = request as unknown as { url: string; body: string };
    expect(captured.url).toBe('https://analytics.example.com/capture/');
    expect(JSON.parse(captured.body)).toMatchObject({ api_key: 'server-test-key', event: 'organization_created', properties: { organization_id: 'org_123' } });
  });

  it('falls back to no-op without a private server key', () => {
    expect(getServerAnalyticsProvider({})).toBeInstanceOf(NoopServerAnalyticsProvider);
  });

  it('swallows provider failures', async () => {
    const provider = new PostHogServerAnalyticsProvider({
      apiKey: 'server-test-key',
      host: 'https://analytics.example.com',
      request: async () => { throw new Error('network down'); },
    });
    await expect(provider.capture('organization_created', { organization_id: 'org_123' })).resolves.toBeUndefined();
  });
});
