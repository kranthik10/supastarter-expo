import React, { type ErrorInfo, type ReactNode } from 'react';
import { createMonitoring, NoopMonitoringProvider, SentryMonitoringProvider, type Monitoring, type MonitoringRequest } from './index';

export function createClientMonitoring(options: { dsn?: string; release?: string; environment?: string; platform?: string; request?: MonitoringRequest }): Monitoring {
  const provider = options.dsn
    ? new SentryMonitoringProvider({ dsn: options.dsn, release: options.release, environment: options.environment, platform: options.platform, request: options.request })
    : new NoopMonitoringProvider();
  return createMonitoring(provider);
}

export type ClientErrorTarget = {
  addEventListener?: (name: string, handler: (event: { error?: unknown; reason?: unknown }) => void) => void;
  removeEventListener?: (name: string, handler: (event: { error?: unknown; reason?: unknown }) => void) => void;
};

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void);
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type BoundaryProps = {
  monitoring: Monitoring;
  children: ReactNode;
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
};

type BoundaryState = { hasError: boolean };

export class MonitoringErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: unknown): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _errorInfo: ErrorInfo): void {
    this.props.monitoring.captureException(error, { error_category: 'render_error' });
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (typeof this.props.fallback === 'function') return this.props.fallback(this.reset);
    return this.props.fallback ?? null;
  }
}

function globalErrorUtils(): ErrorUtilsLike | undefined {
  return (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
}

export function installClientErrorHandlers(
  monitoring: Monitoring,
  options: { target?: ClientErrorTarget; errorUtils?: ErrorUtilsLike } = {}
): () => void {
  const target = options.target ?? (globalThis as unknown as ClientErrorTarget);
  const errorHandler = (event: { error?: unknown }) => {
    monitoring.captureException(event.error ?? new Error('Unhandled client error'), { error_category: 'unhandled_client_error' });
  };
  const rejectionHandler = (event: { reason?: unknown }) => {
    monitoring.captureException(event.reason ?? new Error('Unhandled promise rejection'), { error_category: 'unhandled_promise_rejection' });
  };
  const cleanups: Array<() => void> = [];

  if (target.addEventListener && target.removeEventListener) {
    target.addEventListener('error', errorHandler);
    target.addEventListener('unhandledrejection', rejectionHandler);
    cleanups.push(() => {
      target.removeEventListener?.('error', errorHandler);
      target.removeEventListener?.('unhandledrejection', rejectionHandler);
    });
  }

  const errorUtils = options.errorUtils ?? globalErrorUtils();
  const originalHandler = errorUtils?.getGlobalHandler?.();
  if (errorUtils?.setGlobalHandler && originalHandler) {
    const wrappedHandler = (error: unknown, isFatal?: boolean) => {
      monitoring.captureException(error, { error_category: isFatal ? 'fatal_client_error' : 'unhandled_client_error' });
      originalHandler(error, isFatal);
    };
    errorUtils.setGlobalHandler(wrappedHandler);
    cleanups.push(() => errorUtils.setGlobalHandler?.(originalHandler));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
