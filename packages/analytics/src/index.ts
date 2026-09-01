import {
  analyticsEventNames,
  isAnalyticsEventName,
  isSafeDistinctId,
  isScreenName,
  sanitizeAnalyticsProperties,
  sanitizeIdentifyTraits,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  type AnalyticsProperties,
  type ScreenName,
} from './policy';

export * from './policy';

export interface AnalyticsProvider {
  capture(event: string, properties?: AnalyticsProperties): void | Promise<void>;
  identify(userId: string, traits?: AnalyticsProperties): void | Promise<void>;
  reset(): void | Promise<void>;
  group?(type: 'organization', id: string, traits?: AnalyticsProperties): void | Promise<void>;
  screen?(screen: ScreenName): void | Promise<void>;
}

export class NoopAnalyticsProvider implements AnalyticsProvider {
  capture(): void {}
  identify(): void {}
  reset(): void {}
  group(): void {}
  screen(): void {}
}

export type CapturedAnalyticsEvent = {
  type: 'capture';
  event: string;
  properties: AnalyticsProperties;
};

export class FakeAnalyticsProvider implements AnalyticsProvider {
  readonly events: CapturedAnalyticsEvent[] = [];
  readonly identities: Array<{ id: string; traits: AnalyticsProperties }> = [];
  readonly groups: Array<{ type: 'organization'; id: string; traits?: AnalyticsProperties }> = [];
  readonly screens: ScreenName[] = [];
  resets = 0;

  capture(event: string, properties: AnalyticsProperties = {}): void {
    this.events.push({ type: 'capture', event, properties });
  }

  identify(userId: string, traits: AnalyticsProperties = {}): void {
    this.identities.push({ id: userId, traits });
  }

  reset(): void {
    this.resets += 1;
  }

  group(type: 'organization', id: string, traits?: AnalyticsProperties): void {
    this.groups.push({ type, id, ...(traits && Object.keys(traits).length > 0 ? { traits } : {}) });
  }

  screen(screen: ScreenName): void {
    this.screens.push(screen);
  }
}

type PostHogRequest = (input: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;

export class PostHogAnalyticsProvider implements AnalyticsProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly request: PostHogRequest;
  private distinctId: string | null = null;

  constructor(options: { apiKey: string; host: string; request?: PostHogRequest }) {
    this.apiKey = options.apiKey;
    this.endpoint = `${options.host.replace(/\/$/, '')}/capture/`;
    this.request = options.request ?? ((input, init) => fetch(input, init));
  }

  capture(event: string, properties: AnalyticsProperties = {}): void {
    void this.send(event, { ...properties });
  }

  identify(userId: string, traits: AnalyticsProperties = {}): void {
    this.distinctId = userId;
    void this.send('$identify', { distinct_id: userId, $set: traits });
  }

  reset(): void {
    this.distinctId = null;
  }

  group(type: 'organization', id: string, traits: AnalyticsProperties = {}): void {
    void this.send('$groupidentify', { distinct_id: this.distinctId ?? id, $group_type: type, $group_key: id, $group_set: traits });
  }

  screen(screen: ScreenName): void {
    void this.send('$screen', { $screen_name: screen });
  }

  private async send(event: string, properties: Record<string, unknown>): Promise<void> {
    if (!this.apiKey) return;
    try {
      await this.request(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey, event, properties: { ...properties, $lib: 'supastarter-expo' } }),
      });
    } catch {
      // Analytics is best-effort and must never affect product flows.
    }
  }
}

let provider: AnalyticsProvider = new NoopAnalyticsProvider();
let enabled = false;
let configured = false;

function safely(action: () => void | Promise<void>): void {
  try {
    void Promise.resolve(action()).catch(() => {});
  } catch {
    // Analytics provider failures are intentionally non-fatal.
  }
}

export function setAnalyticsProvider(next: AnalyticsProvider): void {
  provider = next;
  configured = true;
}

export function configureAnalytics(options: { apiKey?: string; host?: string }): void {
  if (configured) return;
  provider = options.apiKey && options.host ? new PostHogAnalyticsProvider({ apiKey: options.apiKey, host: options.host }) : new NoopAnalyticsProvider();
  configured = true;
}

export function setAnalyticsEnabled(next: boolean): void {
  if (enabled && !next) safely(() => provider.reset());
  enabled = next;
}

export function resetAnalyticsForTests(): void {
  provider = new NoopAnalyticsProvider();
  enabled = false;
  configured = false;
}

function captureEvent<E extends AnalyticsEventName>(event: E, properties: AnalyticsEventProperties[E]): void {
  if (!enabled || !isAnalyticsEventName(event)) return;
  const safeProperties = sanitizeAnalyticsProperties(event, properties);
  if (safeProperties === null) return;
  safely(() => provider.capture(event, safeProperties as AnalyticsProperties));
}

export const analytics = {
  capture: captureEvent,
  track: captureEvent,
  identify(userId: string, traits: unknown = {}): void {
    if (!enabled || !isSafeDistinctId(userId)) return;
    safely(() => provider.identify(userId, sanitizeIdentifyTraits(traits)));
  },
  reset(): void {
    safely(() => provider.reset());
  },
  group(type: 'organization', id: string, traits: unknown = {}): void {
    if (!enabled || !isSafeDistinctId(id) || !provider.group) return;
    safely(() => provider.group!(type, id, sanitizeIdentifyTraits(traits)));
  },
  screen(screen: ScreenName): void {
    if (!enabled || !isScreenName(screen) || !provider.screen) return;
    safely(() => provider.screen!(screen));
  },
  isEnabled(): boolean {
    return enabled;
  },
  eventNames: analyticsEventNames,
};

export type { AnalyticsEventName, AnalyticsEventProperties, AnalyticsProperties, ScreenName };
