import { describe, expect, it } from 'vitest';
import {
  FakeAnalyticsProvider,
  NoopAnalyticsProvider,
  analytics,
  resetAnalyticsForTests,
  setAnalyticsEnabled,
  setAnalyticsProvider,
} from './index';

describe('analytics facade', () => {
  it('captures through the fake provider and supports group context', () => {
    const provider = new FakeAnalyticsProvider();
    setAnalyticsProvider(provider);
    setAnalyticsEnabled(true);
    analytics.capture('user_signed_in', { method: 'password' });
    analytics.group('organization', 'org_123');
    expect(provider.events).toEqual([{ type: 'capture', event: 'user_signed_in', properties: { method: 'password' } }]);
    expect(provider.groups).toEqual([{ type: 'organization', id: 'org_123' }]);
  });

  it('disables capture and resets identity after opt-out', () => {
    const provider = new FakeAnalyticsProvider();
    setAnalyticsProvider(provider);
    setAnalyticsEnabled(true);
    analytics.identify('user_123', { locale: 'en' });
    setAnalyticsEnabled(false);
    analytics.capture('user_signed_out', {});
    expect(provider.identities).toEqual([{ id: 'user_123', traits: { locale: 'en' } }]);
    expect(provider.resets).toBe(1);
    expect(provider.events).toHaveLength(0);
  });

  it('swallows provider errors and has a no-op provider', () => {
    setAnalyticsProvider({
      capture: () => { throw new Error('provider down'); },
      identify: () => { throw new Error('provider down'); },
      reset: () => { throw new Error('provider down'); },
      group: () => { throw new Error('provider down'); },
    });
    setAnalyticsEnabled(true);
    expect(() => analytics.capture('user_signed_in', { method: 'password' })).not.toThrow();
    expect(() => analytics.identify('user_123', {})).not.toThrow();
    expect(() => analytics.group('organization', 'org_123')).not.toThrow();
    expect(() => analytics.reset()).not.toThrow();
    expect(new NoopAnalyticsProvider()).toBeInstanceOf(NoopAnalyticsProvider);
  });

  it('restores a clean default provider between tests', () => {
    resetAnalyticsForTests();
    expect(analytics.isEnabled()).toBe(false);
  });
});
