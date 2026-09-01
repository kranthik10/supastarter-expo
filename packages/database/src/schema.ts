import { pgTable, text, timestamp, pgEnum, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['owner', 'admin', 'member']);
export const planEnum = pgEnum('plan', ['free', 'pro', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'trialing', 'incomplete']);
export const providerEnum = pgEnum('provider', ['apple', 'google', 'stripe', 'revenuecat']);
export const invitationStatusEnum = pgEnum('invitation_status', ['pending', 'accepted', 'revoked', 'expired']);
export const localeEnum = pgEnum('locale', ['en', 'de']);
export const themeEnum = pgEnum('theme', ['system', 'light', 'dark']);
export const fileStatusEnum = pgEnum('file_status', ['pending', 'ready', 'deleted']);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name').notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uidx').on(t.email)]
);

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  locale: localeEnum('locale').notNull().default('en'),
  theme: themeEnum('theme').notNull().default('system'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  inviteEmails: boolean('invite_emails').notNull().default(true),
  billingAlerts: boolean('billing_alerts').notNull().default(true),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accounts_provider_uidx').on(t.provider, t.providerAccountId), index('accounts_user_idx').on(t.userId)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_uidx').on(t.token), index('sessions_user_idx').on(t.userId)]
);

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('orgs_slug_uidx').on(t.slug)]
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('org_members_org_user_uidx').on(t.organizationId, t.userId), index('org_members_user_idx').on(t.userId)]
);

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
});

export const permissions = pgTable('permissions', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('role_perm_uidx').on(t.roleId, t.permissionId)]
);

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  seats: integer('seats').notNull(),
  provider: providerEnum('provider').notNull().default('stripe'),
  providerPriceId: text('provider_price_id'),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum('status').notNull(),
    provider: providerEnum('provider').notNull(),
    providerSubscriptionId: text('provider_subscription_id'),
    providerStatus: text('provider_status'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('subs_org_idx').on(t.organizationId)]
);

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').notNull().default('member'),
    token: text('token').notNull().unique(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invitations_org_idx').on(t.organizationId),
    uniqueIndex('invitations_pending_org_email_uidx')
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
  ]
);

export const entitlements = pgTable(
  'entitlements',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    limit: integer('limit'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('entitlements_org_feature_uidx').on(t.organizationId, t.feature), index('entitlements_org_idx').on(t.organizationId)]
);

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  appVersion: text('app_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pushTokens = pgTable('push_tokens', {
  id: text('id').primaryKey(),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  provider: text('provider').notNull().default('expo'),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('push_tokens_device_idx').on(t.deviceId), index('push_tokens_user_active_idx').on(t.userId, t.invalidatedAt)]);

export const files = pgTable(
  'files',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    url: text('url').notNull(),
    contentType: text('content_type'),
    size: integer('size'),
    status: fileStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('files_user_idx').on(t.userId), index('files_org_idx').on(t.organizationId), index('files_status_idx').on(t.status)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    category: text('category').notNull().default('system'),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifs_user_idx').on(t.userId),
    index('notifs_user_read_created_idx').on(t.userId, t.readAt, t.createdAt),
    index('notifs_org_idx').on(t.organizationId),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_org_idx').on(t.organizationId), index('audit_user_idx').on(t.userId)]
);

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  members: many(organizationMembers),
  devices: many(devices),
  notifications: many(notifications),
  preferences: one(userPreferences, { fields: [users.id], references: [userPreferences.userId] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  subscriptions: many(subscriptions),
  invitations: many(invitations),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));
