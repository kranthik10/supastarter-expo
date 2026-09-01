import { and, eq, isNull } from 'drizzle-orm';
import { notifications as notificationsTable, organizationMembers, pushTokens, userPreferences } from '@repo/database';
import { createId } from '@paralleldrive/cuid2';
import {
  decodeNotificationCursor,
  isExpoPushToken,
  notificationCategories,
  parseNotificationData,
  shouldSendPush,
  type NotificationCategory,
  type SafeNotificationData,
} from './policy';

export type PushMessage = {
  token: string;
  title: string;
  body?: string;
  data?: SafeNotificationData;
};

export type PushResult = {
  status: 'accepted' | 'failed' | 'invalid_token' | 'not_configured';
  token: string;
  ticketId?: string;
  error?: string;
};

export interface NotificationProvider {
  readonly name: 'expo' | 'fake' | 'not-configured';
  sendMany(messages: PushMessage[]): Promise<PushResult[]>;
}

export class NotConfiguredNotificationProvider implements NotificationProvider {
  readonly name = 'not-configured' as const;

  async sendMany(messages: PushMessage[]): Promise<PushResult[]> {
    return messages.map((message) => ({ status: 'not_configured' as const, token: message.token, error: 'provider_not_configured' }));
  }
}

export class FakeNotificationProvider implements NotificationProvider {
  readonly name = 'fake' as const;
  readonly messages: PushMessage[] = [];
  private readonly configuredResults: PushResult[] | null;

  constructor(configuredResults?: PushResult[]) {
    this.configuredResults = configuredResults ?? null;
  }

  async sendMany(messages: PushMessage[]): Promise<PushResult[]> {
    this.messages.push(...messages);
    return messages.map((message, index) => {
      const configured = this.configuredResults?.[index];
      return configured ? { ...configured, token: message.token } : { status: 'accepted' as const, token: message.token };
    });
  }
}

export class ExpoPushProvider implements NotificationProvider {
  readonly name = 'expo' as const;
  private readonly endpoint: string;
  private readonly accessToken?: string;

  constructor(options: { endpoint?: string; accessToken?: string } = {}) {
    this.endpoint = options.endpoint ?? 'https://exp.host/--/api/v2/push/send';
    this.accessToken = options.accessToken;
  }

  async sendMany(messages: PushMessage[]): Promise<PushResult[]> {
    const safeMessages = messages.map((message) => {
      if (!isExpoPushToken(message.token)) {
        return { ...message, invalid: true as const };
      }
      return { ...message, invalid: false as const };
    });
    const invalid = safeMessages.filter((message) => message.invalid);
    const valid = safeMessages.filter((message) => !message.invalid);
    const results = new Map<string, PushResult>();

    for (const message of invalid) {
      results.set(message.token, { status: 'failed', token: message.token, error: 'invalid_expo_push_token' });
    }
    if (valid.length === 0) return messages.map((message) => results.get(message.token)!);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(
          valid.map(({ token, title, body, data }) => ({
            to: token,
            title,
            ...(body ? { body } : {}),
            ...(data ? { data } : {}),
          }))
        ),
      });
      const payload = (await response.json().catch(() => null)) as { data?: Array<{ status?: string; id?: string; message?: string; details?: { error?: string } }> } | null;
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      valid.forEach((message, index) => {
        const ticket = tickets[index];
        const error = ticket?.details?.error ?? ticket?.message;
        results.set(message.token, {
          status: response.ok && ticket?.status === 'ok' ? 'accepted' : error === 'DeviceNotRegistered' ? 'invalid_token' : 'failed',
          token: message.token,
          ...(ticket?.id ? { ticketId: ticket.id } : {}),
          ...(error ? { error } : response.ok ? {} : { error: 'provider_http_error' }),
        });
      });
    } catch {
      valid.forEach((message) => results.set(message.token, { status: 'failed', token: message.token, error: 'provider_request_failed' }));
    }

    return messages.map((message) => results.get(message.token)!);
  }
}

let providerOverride: NotificationProvider | null = null;

export function setNotificationProviderForTests(provider: NotificationProvider | null): void {
  providerOverride = provider;
}

export function getNotificationProvider(): NotificationProvider {
  if (providerOverride) return providerOverride;
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  if (env.NOTIFICATIONS_PROVIDER === 'expo') {
    return new ExpoPushProvider({ accessToken: env.EXPO_ACCESS_TOKEN });
  }
  return new NotConfiguredNotificationProvider();
}

export type CreateNotificationInput = {
  userId: string;
  organizationId?: string | null;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  data?: unknown;
};

export type NotificationDelivery = {
  status: 'accepted' | 'partial' | 'failed' | 'skipped' | 'not_configured';
  attempted: boolean;
  tokenCount: number;
  accepted: number;
  failed: number;
  invalidated: number;
  reason?: 'preference_disabled' | 'no_active_tokens' | 'provider_not_configured' | 'provider_error';
};

export type CreatedNotification = {
  notification: typeof notificationsTable.$inferSelect;
  delivery: NotificationDelivery;
};

function validCategory(value: string): value is NotificationCategory {
  return (notificationCategories as readonly string[]).includes(value);
}

function validateCreateInput(input: CreateNotificationInput): SafeNotificationData | undefined {
  if (!input.userId || !validCategory(input.category)) throw new Error('notification_input_invalid');
  if (!input.title.trim() || input.title.length > 160) throw new Error('notification_title_invalid');
  if (input.body !== undefined && input.body !== null && input.body.length > 2_000) throw new Error('notification_body_invalid');
  const data = parseNotificationData(input.data);
  if (data === null) throw new Error('notification_data_invalid');
  return Object.keys(data).length > 0 ? data : undefined;
}

export async function createNotification(db: any, input: CreateNotificationInput, options: { provider?: NotificationProvider; now?: Date } = {}): Promise<CreatedNotification> {
  const data = validateCreateInput(input);
  const now = options.now ?? new Date();
  if (input.organizationId) {
    const [membership] = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)))
      .limit(1);
    if (!membership) throw new Error('notification_organization_scope_invalid');
  }

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      id: createId(),
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      category: input.category,
      title: input.title.trim(),
      body: input.body ?? null,
      data: data ?? null,
      createdAt: now,
    })
    .returning();
  if (!notification) throw new Error('notification_persist_failed');

  const [preferences] = await db
    .select({ billingAlerts: userPreferences.billingAlerts })
    .from(userPreferences)
    .where(eq(userPreferences.userId, input.userId))
    .limit(1);
  const preferenceAllows = shouldSendPush(input.category, preferences ?? { billingAlerts: true });
  if (!preferenceAllows) {
    return {
      notification,
      delivery: { status: 'skipped', attempted: false, tokenCount: 0, accepted: 0, failed: 0, invalidated: 0, reason: 'preference_disabled' },
    };
  }

  const tokens: Array<{ id: string; token: string }> = await db
    .select({ id: pushTokens.id, token: pushTokens.token })
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, input.userId), isNull(pushTokens.invalidatedAt)));
  if (tokens.length === 0) {
    return {
      notification,
      delivery: { status: 'skipped', attempted: false, tokenCount: 0, accepted: 0, failed: 0, invalidated: 0, reason: 'no_active_tokens' },
    };
  }

  const messages: PushMessage[] = tokens.map(({ token }) => ({ token, title: notification.title, ...(notification.body ? { body: notification.body } : {}), ...(data ? { data } : {}) }));
  const provider = options.provider ?? getNotificationProvider();
  let results: PushResult[];
  try {
    results = await provider.sendMany(messages);
  } catch {
    return {
      notification,
      delivery: { status: 'failed', attempted: true, tokenCount: tokens.length, accepted: 0, failed: tokens.length, invalidated: 0, reason: 'provider_error' },
    };
  }

  let accepted = 0;
  let failed = 0;
  let invalidated = 0;
  let notConfigured = 0;
  for (const [index, result] of results.entries()) {
    if (result.status === 'accepted') accepted += 1;
    if (result.status === 'failed') failed += 1;
    if (result.status === 'not_configured') notConfigured += 1;
    if (result.status === 'invalid_token') {
      invalidated += 1;
      const tokenRow = tokens[index];
      if (tokenRow) {
        await db
          .update(pushTokens)
          .set({ invalidatedAt: now })
          .where(and(eq(pushTokens.id, tokenRow.id), eq(pushTokens.userId, input.userId), isNull(pushTokens.invalidatedAt)));
      }
    }
  }

  const status = notConfigured > 0 ? 'not_configured' : accepted === results.length ? 'accepted' : accepted > 0 ? 'partial' : 'failed';
  return {
    notification,
    delivery: {
      status,
      attempted: provider.name !== 'not-configured',
      tokenCount: tokens.length,
      accepted,
      failed: failed + notConfigured,
      invalidated,
      ...(notConfigured > 0 ? { reason: 'provider_not_configured' as const } : {}),
    },
  };
}

export { decodeNotificationCursor };
export type { NotificationCategory, SafeNotificationData } from './policy';
