import { describe, expect, it } from 'vitest';
import {
  FakeMonitoringProvider,
  NoopMonitoringProvider,
  createMonitoring,
  type MonitoringProvider,
} from './index';

describe('monitoring facade', () => {
  it('captures sanitized exceptions with safe lifecycle context', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider, { environment: 'test', release: 'mobile@1.0.0' });

    monitoring.setUserContext('user_123');
    monitoring.setOrganizationContext({ organizationId: 'org_a', role: 'owner', planTier: 'pro' });
    monitoring.setRoute('/(app)/(tabs)/settings?token=secret');
    monitoring.captureException(new Error('database unavailable'), { authorization: 'Bearer raw', operation: 'read' });

    expect(provider.exceptions).toHaveLength(1);
    expect(provider.exceptions[0]).toMatchObject({
      error: { name: 'Error', message: 'database unavailable' },
      context: { operation: 'read', authorization: '[REDACTED]', route: 'settings' },
    });
    expect(provider.users).toEqual([{ id: 'user_123' }]);
    expect(provider.contexts.organization).toEqual({ organization_id: 'org_a', organization_role: 'owner', plan_tier: 'pro' });
  });

  it('replaces organization context and clears it with user logout', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider);
    monitoring.setUserContext('user_123');
    monitoring.setOrganizationContext({ organizationId: 'org_a' });
    monitoring.setOrganizationContext({ organizationId: 'org_b' });
    monitoring.setUserContext(null);

    expect(provider.contexts.organization).toBeUndefined();
    expect(provider.users).toEqual([{ id: 'user_123' }, null]);
    expect(provider.clearedContexts).toContain('organization');
  });

  it('does not throw when provider methods fail and supports no-op provider', () => {
    const failingProvider: MonitoringProvider = {
      captureException: () => { throw new Error('sentry unavailable'); },
      captureMessage: () => { throw new Error('sentry unavailable'); },
      setUser: () => { throw new Error('sentry unavailable'); },
      setContext: () => { throw new Error('sentry unavailable'); },
      clearContext: () => { throw new Error('sentry unavailable'); },
    };
    const monitoring = createMonitoring(failingProvider);

    expect(() => monitoring.captureException(new Error('failure'))).not.toThrow();
    expect(() => monitoring.captureMessage('diagnostic', 'warning')).not.toThrow();
    expect(() => monitoring.setUserContext('user_123')).not.toThrow();
    expect(() => monitoring.setOrganizationContext({ organizationId: 'org_123' })).not.toThrow();
    expect(() => monitoring.setUserContext(null)).not.toThrow();
    expect(new NoopMonitoringProvider()).toBeInstanceOf(NoopMonitoringProvider);
  });
});
