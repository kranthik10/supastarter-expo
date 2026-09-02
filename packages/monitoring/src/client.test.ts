import { describe, expect, it } from 'vitest';
import { FakeMonitoringProvider, createMonitoring } from './index';
import { MonitoringErrorBoundary, installClientErrorHandlers } from './client';

describe('client monitoring integration', () => {
  it('captures render errors and exposes a non-diagnostic fallback state', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider);
    const boundary = new MonitoringErrorBoundary({ monitoring, children: null });

    expect(MonitoringErrorBoundary.getDerivedStateFromError(new Error('render failed'))).toEqual({ hasError: true });
    boundary.componentDidCatch(new Error('render failed'), { componentStack: '\n at Settings' });

    expect(provider.exceptions).toHaveLength(1);
    expect(provider.exceptions[0].context).toMatchObject({ error_category: 'render_error' });
  });

  it('installs and removes safe browser unhandled-error listeners', () => {
    const provider = new FakeMonitoringProvider();
    const monitoring = createMonitoring(provider);
    const handlers: Record<string, (event: { error?: unknown; reason?: unknown }) => void> = {};
    const target = {
      addEventListener: (name: string, handler: (event: { error?: unknown; reason?: unknown }) => void) => { handlers[name] = handler; },
      removeEventListener: (name: string) => { delete handlers[name]; },
    };

    const cleanup = installClientErrorHandlers(monitoring, { target });
    handlers.error({ error: new Error('uncaught') });
    handlers.unhandledrejection({ reason: new Error('rejected') });

    expect(provider.exceptions).toHaveLength(2);
    cleanup();
    expect(handlers).toEqual({});
  });
});
