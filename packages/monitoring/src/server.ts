import {
  createMonitoring,
  NoopMonitoringProvider,
  SentryMonitoringProvider,
  type Monitoring,
  type MonitoringRequest,
} from './index';
import {
  isExpectedMonitoringErrorCode,
  isMonitoringEnvironment,
  sanitizeServerRequestContext,
  type MonitoringEnvironment,
  type MonitoringContext,
} from './policy';

export class SentryServerMonitoringProvider extends SentryMonitoringProvider {
  constructor(options: { dsn: string; release?: string; environment?: string; platform?: string; request?: MonitoringRequest }) {
    super(options);
  }
}

function processEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

export function getServerMonitoring(env: Record<string, string | undefined> = processEnv()): Monitoring {
  const environment: MonitoringEnvironment = env.EXPO_PUBLIC_APP_VARIANT && isMonitoringEnvironment(env.EXPO_PUBLIC_APP_VARIANT)
    ? env.EXPO_PUBLIC_APP_VARIANT
    : 'development';
  const provider = env.SENTRY_DSN_SERVER
    ? new SentryServerMonitoringProvider({ dsn: env.SENTRY_DSN_SERVER, release: env.SENTRY_RELEASE, environment, platform: 'node' })
    : new NoopMonitoringProvider();
  return createMonitoring(provider, { environment, release: env.SENTRY_RELEASE, platform: 'node' });
}

export type ServerMonitoringContext = {
  code?: string;
  method?: string;
  route?: string;
  procedure?: string;
  status?: number;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
};

export function captureServerException(monitoring: Monitoring, error: unknown, context: ServerMonitoringContext = {}): void {
  const safeContext = sanitizeServerRequestContext(context);
  if (isExpectedMonitoringErrorCode(typeof safeContext.code === 'string' ? safeContext.code : undefined)) return;
  monitoring.captureException(error, safeContext as MonitoringContext);
}
