import {
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from './policy';

export interface ServerAnalyticsProvider {
  capture(event: AnalyticsEventName, properties?: AnalyticsProperties): void | Promise<void>;
}

export class NoopServerAnalyticsProvider implements ServerAnalyticsProvider {
  capture(): void {}
}

type ServerPostHogRequest = (input: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;

export class PostHogServerAnalyticsProvider implements ServerAnalyticsProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly request: ServerPostHogRequest;

  constructor(options: { apiKey: string; host: string; request?: ServerPostHogRequest }) {
    this.apiKey = options.apiKey;
    this.endpoint = `${options.host.replace(/\/$/, '')}/capture/`;
    this.request = options.request ?? ((input, init) => fetch(input, init));
  }

  async capture(event: AnalyticsEventName, properties: AnalyticsProperties = {}): Promise<void> {
    if (!this.apiKey) return;
    try {
      await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey, event, properties: { ...properties, $lib: 'supastarter-expo-server' } }),
      });
    } catch {
      // Analytics must never fail the authoritative server operation.
    }
  }
}

function processEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

export function getServerAnalyticsProvider(env: Record<string, string | undefined> = processEnv()): ServerAnalyticsProvider {
  const apiKey = env.POSTHOG_SERVER_KEY;
  const host = env.POSTHOG_HOST ?? env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
  return apiKey ? new PostHogServerAnalyticsProvider({ apiKey, host }) : new NoopServerAnalyticsProvider();
}

export function captureServerEvent(provider: ServerAnalyticsProvider, event: string, properties: unknown = {}): void {
  if (!isAnalyticsEventName(event)) return;
  const safeProperties = sanitizeAnalyticsProperties(event, properties);
  if (safeProperties === null) return;
  try {
    void Promise.resolve(provider.capture(event, safeProperties as AnalyticsProperties)).catch(() => {});
  } catch {
    // Analytics must never fail the authoritative server operation.
  }
}
