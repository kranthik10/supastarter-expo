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
  analyticsEnabled: boolean('analytics_enabled').notNull().default(true),
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
  (t) => [uniqueIndex('subs_org_uidx').on(t.organizationId), index('subs_org_idx').on(t.organizationId)]
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

export const notes = pgTable(
  'notes',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notes_org_idx').on(t.organizationId), index('notes_user_idx').on(t.userId)]
);

// ── ServiceHub marketplace (Phase 6 reference product domain) ──────────────
// Catalog (categories/services) is global to the marketplace: any
// authenticated user may read it. Ownership-scoped rows (addresses,
// bookings, reviews, favorites) key off users.id — the marketplace
// customer/provider identity, deliberately distinct from SaaS
// organization owner/admin/member roles.

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
]);

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    icon: text('icon').notNull().default('sparkles'),
    displayOrder: integer('display_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('svc_cats_active_order_idx').on(t.active, t.displayOrder)]
);

export const services = pgTable(
  'services',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('USD'),
    active: boolean('active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('services_category_idx').on(t.categoryId),
    index('services_active_order_idx').on(t.active, t.displayOrder),
    index('services_price_idx').on(t.priceMinor),
  ]
);

export const serviceProviders = pgTable(
  'service_providers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    active: boolean('active').notNull().default(true),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('svc_providers_user_idx').on(t.userId), index('svc_providers_active_idx').on(t.active)]
);

export const providerServices = pgTable(
  'provider_services',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    priceMinor: integer('price_minor'),
    durationMinutes: integer('duration_minutes'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('provider_services_provider_service_uidx').on(t.providerId, t.serviceId),
    index('provider_services_service_idx').on(t.serviceId),
    index('provider_services_provider_idx').on(t.providerId),
  ]
);

export const providerAvailability = pgTable(
  'provider_availability',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMinutes: integer('start_minutes').notNull(),
    endMinutes: integer('end_minutes').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provider_avail_provider_idx').on(t.providerId)]
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    region: text('region').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull().default('US'),
    instructions: text('instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customer_addresses_user_idx').on(t.userId)]
);

export const bookings = pgTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'restrict' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    // Commercial snapshot: history shows the agreed price even if the
    // catalog changes later. Never trust client-supplied amounts.
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('USD'),
    durationMinutes: integer('duration_minutes').notNull(),
    serviceName: text('service_name').notNull(),
    providerName: text('provider_name').notNull(),
    // Address snapshot: bookings keep working if the address is deleted.
    addressId: text('address_id').references(() => customerAddresses.id, { onDelete: 'set null' }),
    addressLabel: text('address_label').notNull(),
    addressLine1: text('address_line1').notNull(),
    addressCity: text('address_city').notNull(),
    addressRegion: text('address_region').notNull(),
    addressPostalCode: text('address_postal_code').notNull(),
    addressCountry: text('address_country').notNull(),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
    status: bookingStatusEnum('status').notNull().default('pending'),
    customerNote: text('customer_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_customer_idx').on(t.customerId),
    index('bookings_provider_idx').on(t.providerId),
    index('bookings_status_idx').on(t.status),
    index('bookings_scheduled_idx').on(t.scheduledStart),
    index('bookings_provider_scheduled_idx').on(t.providerId, t.scheduledStart),
  ]
);

export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromStatus: bookingStatusEnum('from_status'),
    toStatus: bookingStatusEnum('to_status').notNull(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('booking_history_booking_idx').on(t.bookingId)]
);

export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reviews_provider_idx').on(t.providerId), index('reviews_customer_idx').on(t.customerId)]
);

export const favoriteServices = pgTable(
  'favorite_services',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fav_services_user_service_uidx').on(t.userId, t.serviceId)]
);

export const favoriteProviders = pgTable(
  'favorite_providers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => serviceProviders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fav_providers_user_provider_uidx').on(t.userId, t.providerId)]
);

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  members: many(organizationMembers),
  devices: many(devices),
  notifications: many(notifications),
  preferences: one(userPreferences, { fields: [users.id], references: [userPreferences.userId] }),
  providerProfile: one(serviceProviders, { fields: [users.id], references: [serviceProviders.userId] }),
  customerAddresses: many(customerAddresses),
  customerBookings: many(bookings, { relationName: 'customerBookings' }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  subscriptions: many(subscriptions),
  invitations: many(invitations),
  notes: many(notes),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));
