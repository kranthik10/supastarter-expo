import {
  isExpectedMonitoringErrorCode,
  isMonitoringEnvironment,
  sanitizeMonitoringContext,
  sanitizeMonitoringError,
  sanitizeMonitoringRoute,
  type MonitoringContext,
  type MonitoringEnvironment,
  type MonitoringError,
  type MonitoringLevel,
} from './policy';

export * from './policy';

export type MonitoringUser = { id: string };

export interface MonitoringProvider {
  captureException(error: MonitoringError, context?: MonitoringContext): void | Promise<void>;
  captureMessage?(message: string, level?: MonitoringLevel, context?: MonitoringContext): void | Promise<void>;
  setUser?(user: MonitoringUser | null): void | Promise<void>;
  setContext?(name: string, context: MonitoringContext): void | Promise<void>;
  clearContext?(name: string): void | Promise<void>;
}

export type MonitoringMetadata = {
  environment?: MonitoringEnvironment;
  release?: string;
  platform?: string;
};

export type OrganizationMonitoringContext = {
  organizationId: string;
  role?: 'owner' | 'admin' | 'member';
  planTier?: 'free' | 'pro' | 'enterprise';
};

export interface Monitoring {
  captureException(error: unknown, context?: unknown): void;
  captureMessage(message: string, level?: MonitoringLevel, context?: unknown): void;
  setUserContext(userId: string | null): void;
  setOrganizationContext(context: OrganizationMonitoringContext | null): void;
  setRoute(route: string | null): void;
}

export class NoopMonitoringProvider implements MonitoringProvider {
  captureException(): void {}
  captureMessage(): void {}
  setUser(): void {}
  setContext(): void {}
  clearContext(): void {}
}

export class FakeMonitoringProvider implements MonitoringProvider {
  readonly exceptions: Array<{ error: MonitoringError; context: MonitoringContext }> = [];
  readonly messages: Array<{ message: string; level: MonitoringLevel; context: MonitoringContext }> = [];
  readonly users: Array<MonitoringUser | null> = [];
  readonly contexts: Record<string, MonitoringContext> = {};
  readonly clearedContexts: string[] = [];

  captureException(error: MonitoringError, context: MonitoringContext = {}): void {
    this.exceptions.push({ error, context });
  }

  captureMessage(message: string, level: MonitoringLevel = 'info', context: MonitoringContext = {}): void {
    this.messages.push({ message, level, context });
  }

  setUser(user: MonitoringUser | null): void {
    this.users.push(user);
  }

  setContext(name: string, context: MonitoringContext): void {
    this.contexts[name] = context;
  }

  clearContext(name: string): void {
    delete this.contexts[name];
    this.clearedContexts.push(name);
  }
}

export type MonitoringRequest = (input: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;

function isSafeOpaqueId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function eventId(): string {
  const cryptoObject = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoObject?.randomUUID?.().replaceAll('-', '') ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 32);
}

function parseSentryDsn(dsn: string): { endpoint: string } | null {
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    if (!projectId || !url.username || !['http:', 'https:'].includes(url.protocol)) return null;
    const prefix = segments.length > 0 ? `/${segments.join('/')}` : '';
    return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/store/?sentry_version=7&sentry_key=${encodeURIComponent(url.username)}` };
  } catch {
    return null;
  }
}

export class SentryMonitoringProvider implements MonitoringProvider {
  private readonly endpoint: string | null;
  private readonly release?: string;
  private readonly environment?: MonitoringEnvironment;
  private readonly platform: string;
  private readonly request: MonitoringRequest;
  private user: MonitoringUser | null = null;
  private readonly contexts: Record<string, MonitoringContext> = {};

  constructor(options: { dsn: string; release?: string; environment?: string; platform?: string; request?: MonitoringRequest }) {
    this.endpoint = parseSentryDsn(options.dsn)?.endpoint ?? null;
    this.release = options.release?.slice(0, 128);
    this.environment = options.environment && isMonitoringEnvironment(options.environment) ? options.environment : undefined;
    this.platform = options.platform?.slice(0, 32) || 'javascript';
    this.request = options.request ?? ((input, init) => fetch(input, init));
  }

  captureException(error: MonitoringError, context: MonitoringContext = {}): void {
    const safeError = sanitizeMonitoringError(error);
    const safeContext = sanitizeMonitoringContext(context);
    void this.send({
      level: 'error',
      exception: { values: [{ type: safeError.name, value: safeError.message, ...(safeError.stack ? { stacktrace: { frames: [], raw: safeError.stack } } : {}) }] },
      extra: safeContext,
    });
  }

  captureMessage(message: string, level: MonitoringLevel = 'info', context: MonitoringContext = {}): void {
    void this.send({ level, message: sanitizeMonitoringError(new Error(message)).message, extra: sanitizeMonitoringContext(context) });
  }

  setUser(user: MonitoringUser | null): void {
    this.user = user && isSafeOpaqueId(user.id) ? { id: user.id } : null;
  }

  setContext(name: string, context: MonitoringContext): void {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(name)) return;
    this.contexts[name] = sanitizeMonitoringContext(context);
  }

  clearContext(name: string): void {
    delete this.contexts[name];
  }

  private async send(payload: Record<string, unknown>): Promise<void> {
    if (!this.endpoint) return;
    const id = eventId();
    const event = {
      event_id: id,
      platform: this.platform,
      release: this.release,
      environment: this.environment,
      user: this.user ?? undefined,
      contexts: Object.keys(this.contexts).length > 0 ? this.contexts : undefined,
      ...payload,
    };
    const body = JSON.stringify(event);
    const envelope = `${JSON.stringify({ event_id: id })}\n${JSON.stringify({ type: 'event', length: body.length })}\n${body}\n`;
    try {
      await this.request(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope });
    } catch {
      // Monitoring transport is best-effort and must never affect product behavior.
    }
  }
}

function safely(action: () => void | Promise<void>): void {
  try {
    void Promise.resolve(action()).catch(() => {});
  } catch {
    // Provider failures are intentionally isolated.
  }
}

function safeMergedContext(active: MonitoringContext, context: unknown): MonitoringContext {
  const merged = sanitizeMonitoringContext({ ...active, ...sanitizeMonitoringContext(context) });
  if (typeof merged.route === 'string') merged.route = sanitizeMonitoringRoute(merged.route) ?? 'unknown';
  return merged;
}

export function createMonitoring(provider: MonitoringProvider, _metadata: MonitoringMetadata = {}): Monitoring {
  const activeContext: MonitoringContext = {};
  let currentUserId: string | null = null;

  const clearUserScopedContext = () => {
    delete activeContext.organization_id;
    delete activeContext.organization_role;
    delete activeContext.plan_tier;
    delete activeContext.route;
    safely(() => provider.clearContext?.('organization'));
    safely(() => provider.clearContext?.('route'));
  };

  return {
    captureException(error: unknown, context: unknown = {}): void {
      const safeError = sanitizeMonitoringError(error);
      const safeContext = safeMergedContext(activeContext, context);
      const code = typeof safeContext.code === 'string' ? safeContext.code : undefined;
      if (isExpectedMonitoringErrorCode(code)) return;
      safely(() => provider.captureException(safeError, safeContext));
    },
    captureMessage(message: string, level: MonitoringLevel = 'info', context: unknown = {}): void {
      if (!provider.captureMessage) return;
      safely(() => provider.captureMessage!(sanitizeMonitoringError(new Error(message)).message, level, safeMergedContext(activeContext, context)));
    },
    setUserContext(userId: string | null): void {
      const nextUserId = userId && isSafeOpaqueId(userId) ? userId : null;
      if (currentUserId !== null && currentUserId !== nextUserId) clearUserScopedContext();
      if (nextUserId === null) clearUserScopedContext();
      currentUserId = nextUserId;
      safely(() => provider.setUser?.(nextUserId ? { id: nextUserId } : null));
    },
    setOrganizationContext(context: OrganizationMonitoringContext | null): void {
      safely(() => provider.clearContext?.('organization'));
      delete activeContext.organization_id;
      delete activeContext.organization_role;
      delete activeContext.plan_tier;
      if (!context || !isSafeOpaqueId(context.organizationId)) return;
      const organization: MonitoringContext = { organization_id: context.organizationId };
      if (context.role) organization.organization_role = context.role;
      if (context.planTier) organization.plan_tier = context.planTier;
      Object.assign(activeContext, organization);
      safely(() => provider.setContext?.('organization', organization));
    },
    setRoute(route: string | null): void {
      const safeRoute = route ? sanitizeMonitoringRoute(route) : undefined;
      if (!safeRoute) {
        delete activeContext.route;
        safely(() => provider.clearContext?.('route'));
        return;
      }
      activeContext.route = safeRoute;
      safely(() => provider.setContext?.('route', { route: safeRoute }));
    },
  };
}
