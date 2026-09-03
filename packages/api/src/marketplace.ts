import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getDb } from '@repo/database';
import {
  bookingStatusHistory,
  bookings,
  customerAddresses,
  favoriteProviders,
  favoriteServices,
  providerAvailability,
  providerServices,
  reviews,
  serviceCategories,
  serviceProviders,
  services,
} from '@repo/database';
import { and, asc, desc, eq, gt, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createNotification } from '@repo/notifications/server';
import { captureServerEvent, getServerAnalyticsProvider } from '@repo/analytics/server';
import { protectedProcedure, router } from './rpc';

// ── ServiceHub marketplace server module (Phase 6 reference domain) ────────
// Identity model: marketplace customer/provider identity keys off users.id
// and is deliberately distinct from SaaS organization owner/admin/member
// roles. Catalog reads are authenticated-public; every ownership-scoped
// row is constrained by the caller's user id before any data is returned.
// The client never supplies price, status, or ownership — the server
// derives all three.

const serverMarketplaceAnalytics = getServerAnalyticsProvider();

const idSchema = z.string().trim().min(1).max(128);
const searchSchema = z.string().trim().min(1).max(128);
const limitSchema = z.number().int().min(1).max(100).default(20);
const cursorSchema = z.string().trim().min(1).max(256);

type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'in_progress'];
const TERMINAL_BOOKING_STATUSES: BookingStatus[] = ['completed', 'cancelled', 'rejected'];

// Provider-driven lifecycle. Customers may only cancel (a separate,
// narrower rule enforced in bookings.cancel).
const PROVIDER_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

function isUniqueViolation(error: unknown): boolean {
  // Drizzle surfaces driver errors wrapped (message prefixed with the failed
  // query), so walk the cause chain and match Postgres's duplicate-key
  // wording rather than relying on a top-level .code alone.
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = (current as { code?: unknown })?.code;
    if (code === '23505') return true;
    const message = (current as { message?: unknown })?.message;
    if (typeof message === 'string' && /duplicate key|unique constraint|UNIQUE constraint/i.test(message)) return true;
    current = (current as { cause?: unknown })?.cause;
  }
  return false;
}

function forbidden(message: string): never {
  throw new TRPCError({ code: 'FORBIDDEN', message });
}

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function notFound(message: string): never {
  throw new TRPCError({ code: 'NOT_FOUND', message });
}

function conflict(message: string): never {
  throw new TRPCError({ code: 'CONFLICT', message });
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// ── Timezone-aware availability ─────────────────────────────────────────────
// Windows are wall-clock times in the provider's stated timezone.
// Conversions use Intl (no date library). DST edge cases (skipped/repeated
// wall times) resolve to the nearest valid instant — documented limitation,
// acceptable for a reference product, never silently widened.
let timeZoneCache: Set<string> | null = null;

export function isSupportedTimeZone(value: string): boolean {
  // 'UTC' is a valid IANA alias accepted by formatters but absent from
  // supportedValuesOf in some ICU builds — accept it explicitly.
  if (value === 'UTC') return true;
  try {
    if (!timeZoneCache) timeZoneCache = new Set(Intl.supportedValuesOf('timeZone'));
    return timeZoneCache.has(value);
  } catch {
    return false;
  }
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function zonedParts(date: Date, timeZone: string): { weekday: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string): string | undefined => parts.find((part) => part.type === type)?.value;
    const weekday = WEEKDAY_SHORT.indexOf(get('weekday') as (typeof WEEKDAY_SHORT)[number]);
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    if (weekday < 0 || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday, minutes: ((hour % 24) * 60 + minute) % 1440 };
  } catch {
    return null;
  }
}

/** Convert a wall-clock time in `timeZone` to a UTC instant (nearest valid). */
export function zonedTimeToUtc(year: number, month: number, day: number, minutes: number, timeZone: string): Date | null {
  let utc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  for (let i = 0; i < 3; i += 1) {
    const wall = zonedParts(new Date(utc), timeZone);
    if (!wall) return null;
    const base = Date.UTC(year, month - 1, day);
    const wallAbsolute = base + wall.minutes * 60000;
    const targetAbsolute = base + minutes * 60000;
    const diff = targetAbsolute - wallAbsolute;
    if (Math.abs(diff) < 60000) break;
    utc += diff;
  }
  return new Date(utc);
}

type AvailabilityWindow = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  timezone: string;
};

export function buildSlotsForWindows(input: {
  windows: AvailabilityWindow[];
  durationMinutes: number;
  from: Date;
  days: number;
  now: Date;
  existing: { start: Date; end: Date }[];
  maxSlots?: number;
}): Date[] {
  const { windows, durationMinutes, from, days, now, existing } = input;
  const maxSlots = input.maxSlots ?? 200;
  const stepMinutes = 30;
  const slots: Date[] = [];
  const active = windows.filter((window) => window.startMinutes < window.endMinutes);
  if (active.length === 0 || durationMinutes <= 0) return slots;
  const timezones = [...new Set(active.map((window) => window.timezone))];

  for (const timeZone of timezones) {
    const fromWall = zonedParts(from, timeZone);
    if (!fromWall) continue;
    // Anchor the day walk on the provider-local calendar date of `from`.
    const fromDateParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(from)
      .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    const baseYear = Number(fromDateParts.year);
    const baseMonth = Number(fromDateParts.month);
    const baseDay = Number(fromDateParts.day);
    if (!Number.isFinite(baseYear) || !Number.isFinite(baseMonth) || !Number.isFinite(baseDay)) continue;

    for (let offset = 0; offset < days && slots.length < maxSlots; offset += 1) {
      const dayUtc = new Date(Date.UTC(baseYear, baseMonth - 1, baseDay + offset, 12, 0, 0));
      const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(dayUtc)
        .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
      const year = Number(dayParts.year);
      const month = Number(dayParts.month);
      const day = Number(dayParts.day);
      // Weekday must be evaluated in the provider timezone, not UTC.
      const probeNoon = zonedTimeToUtc(year, month, day, 12 * 60, timeZone);
      const localWeekday = probeNoon ? (zonedParts(probeNoon, timeZone)?.weekday ?? -1) : -1;

      for (const window of active) {
        if (window.timezone !== timeZone || window.weekday !== localWeekday) continue;
        for (let start = window.startMinutes; start + durationMinutes <= window.endMinutes; start += stepMinutes) {
          const slot = zonedTimeToUtc(year, month, day, start, timeZone);
          if (!slot || slot.getTime() <= now.getTime() || slot.getTime() < from.getTime()) continue;
          const end = new Date(slot.getTime() + durationMinutes * 60000);
          const overlaps = existing.some((booking) => booking.start < end && booking.end > slot);
          if (overlaps) continue;
          // De-duplicate identical instants from overlapping windows.
          if (slots.some((kept) => kept.getTime() === slot.getTime())) continue;
          slots.push(slot);
          if (slots.length >= maxSlots) break;
        }
        if (slots.length >= maxSlots) break;
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

// ── Public projections (never leak other users' private fields) ─────────────

function providerRating(sum: number, count: number): { average: number | null; count: number } {
  return { average: count > 0 ? Math.round((sum / count) * 10) / 10 : null, count };
}

function toPublicProvider(row: {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  active: boolean;
  ratingSum: number;
  ratingCount: number;
}) {
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    active: row.active,
    rating: providerRating(row.ratingSum, row.ratingCount),
  };
}

function toPublicService(row: {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    durationMinutes: row.durationMinutes,
    priceMinor: row.priceMinor,
    currency: row.currency,
    displayOrder: row.displayOrder,
  };
}

function toPublicBooking(row: typeof bookings.$inferSelect) {
  return {
    id: row.id,
    providerId: row.providerId,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    providerName: row.providerName,
    priceMinor: row.priceMinor,
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    address: {
      label: row.addressLabel,
      line1: row.addressLine1,
      city: row.addressCity,
      region: row.addressRegion,
      postalCode: row.addressPostalCode,
      country: row.addressCountry,
    },
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    status: row.status,
    customerNote: row.customerNote,
    createdAt: row.createdAt,
  };
}

function toPublicAddress(row: typeof customerAddresses.$inferSelect) {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    instructions: row.instructions,
  };
}

async function getOwnProvider(db: any, userId: string) {
  const [profile] = await db.select().from(serviceProviders).where(eq(serviceProviders.userId, userId)).limit(1);
  return profile ?? null;
}

async function notifyBookingParty(
  db: any,
  input: { userId: string; title: string; body: string; bookingId: string }
): Promise<void> {
  try {
    await createNotification(db, {
      userId: input.userId,
      organizationId: null,
      category: 'booking',
      title: input.title,
      body: input.body,
      data: { route: `/booking/${input.bookingId}` },
    });
  } catch {
    // Booking state remains authoritative even if notification persistence is unavailable.
  }
}

const serviceSortSchema = z.enum(['recommended', 'price_asc', 'price_desc']);
const bookingScopeSchema = z.enum(['upcoming', 'past', 'cancelled']);

export const marketplaceRouter = router({
  // ── Catalog (authenticated-public reads) ──────────────────────────────────
  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const rows = await db
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.active, true))
        .orderBy(asc(serviceCategories.displayOrder), asc(serviceCategories.id));
      return {
        categories: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          icon: row.icon,
          displayOrder: row.displayOrder,
        })),
      };
    }),
  }),

  services: router({
    list: protectedProcedure
      .input(
        z
          .object({
            categoryId: idSchema.optional(),
            search: searchSchema.optional(),
            maxPriceMinor: z.number().int().min(0).max(100_000_00).optional(),
            sort: serviceSortSchema.default('recommended'),
            limit: limitSchema,
            cursor: cursorSchema.optional(),
          })
          .strict()
      )
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const conditions = [eq(services.active, true)];
        if (input.categoryId) conditions.push(eq(services.categoryId, input.categoryId));
        if (input.maxPriceMinor !== undefined) conditions.push(lte(services.priceMinor, input.maxPriceMinor));
        if (input.search) conditions.push(sql`${services.name} ILIKE ${`%${escapeLikePattern(input.search)}%`} ESCAPE '\\'`);
        if (input.cursor) {
          const separator = input.cursor.lastIndexOf('|');
          if (separator <= 0) badRequest('service_cursor_invalid');
          const key = input.cursor.slice(0, separator);
          const cursorId = input.cursor.slice(separator + 1);
          if (input.sort === 'recommended') {
            const order = Number(key);
            if (!Number.isInteger(order)) badRequest('service_cursor_invalid');
            conditions.push(or(sql`${services.displayOrder} > ${order}`, and(eq(services.displayOrder, order), gt(services.id, cursorId)))!);
          } else {
            const price = Number(key);
            if (!Number.isInteger(price) || price < 0) badRequest('service_cursor_invalid');
            conditions.push(or(sql`${services.priceMinor} > ${price}`, and(eq(services.priceMinor, price), gt(services.id, cursorId)))!);
          }
        }
        const ordering =
          input.sort === 'price_asc'
            ? [asc(services.priceMinor), asc(services.id)]
            : input.sort === 'price_desc'
              ? [desc(services.priceMinor), asc(services.id)]
              : [asc(services.displayOrder), asc(services.id)];
        const rows = await db
          .select()
          .from(services)
          .where(and(...conditions))
          .orderBy(...ordering)
          .limit(input.limit + 1);
        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;
        const last = page[page.length - 1];
        return {
          services: page.map(toPublicService),
          nextCursor:
            hasMore && last
              ? input.sort === 'recommended'
                ? `${last.displayOrder}|${last.id}`
                : `${last.priceMinor}|${last.id}`
              : null,
        };
      }),

    get: protectedProcedure.input(z.object({ serviceId: idSchema }).strict()).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
      if (!service) notFound('service_not_found');
      const [category] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, service.categoryId)).limit(1);
      const offerings = await db
        .select({ offering: providerServices, provider: serviceProviders })
        .from(providerServices)
        .innerJoin(serviceProviders, eq(providerServices.providerId, serviceProviders.id))
        .where(and(eq(providerServices.serviceId, input.serviceId), eq(providerServices.active, true), eq(serviceProviders.active, true)))
        .limit(20);
      return {
        service: toPublicService(service),
        category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
        providers: offerings.map(({ offering, provider }) => ({
          offeringId: offering.id,
          provider: toPublicProvider(provider),
          priceMinor: offering.priceMinor ?? service.priceMinor,
          currency: service.currency,
          durationMinutes: offering.durationMinutes ?? service.durationMinutes,
        })),
      };
    }),
  }),

  providers: router({
    get: protectedProcedure.input(z.object({ providerId: idSchema }).strict()).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, input.providerId)).limit(1);
      if (!provider || !provider.active) notFound('provider_not_found');
      const offered = await db
        .select({ offering: providerServices, service: services })
        .from(providerServices)
        .innerJoin(services, eq(providerServices.serviceId, services.id))
        .where(and(eq(providerServices.providerId, provider.id), eq(providerServices.active, true), eq(services.active, true)))
        .limit(50);
      const recentReviews = await db
        .select()
        .from(reviews)
        .where(eq(reviews.providerId, provider.id))
        .orderBy(desc(reviews.createdAt))
        .limit(5);
      const windows = await db
        .select()
        .from(providerAvailability)
        .where(and(eq(providerAvailability.providerId, provider.id), eq(providerAvailability.active, true)))
        .limit(28);
      return {
        provider: toPublicProvider(provider),
        services: offered.map(({ offering, service }) => ({
          offeringId: offering.id,
          service: toPublicService(service),
          priceMinor: offering.priceMinor ?? service.priceMinor,
          currency: service.currency,
          durationMinutes: offering.durationMinutes ?? service.durationMinutes,
        })),
        availability: windows.map((window) => ({
          weekday: window.weekday,
          startMinutes: window.startMinutes,
          endMinutes: window.endMinutes,
          timezone: window.timezone,
        })),
        reviews: {
          rating: providerRating(provider.ratingSum, provider.ratingCount),
          recent: recentReviews.map((review) => ({
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
          })),
        },
      };
    }),

    reviews: router({
      list: protectedProcedure
        .input(z.object({ providerId: idSchema, limit: limitSchema }).strict())
        .query(async ({ ctx, input }) => {
          const db = ctx.db ?? getDb();
          const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, input.providerId)).limit(1);
          if (!provider) notFound('provider_not_found');
          const rows = await db
            .select()
            .from(reviews)
            .where(eq(reviews.providerId, input.providerId))
            .orderBy(desc(reviews.createdAt))
            .limit(input.limit);
          return {
            rating: providerRating(provider.ratingSum, provider.ratingCount),
            reviews: rows.map((review) => ({
              id: review.id,
              rating: review.rating,
              comment: review.comment,
              createdAt: review.createdAt,
            })),
          };
        }),
    }),
  }),

  availability: router({
    slots: protectedProcedure
      .input(
        z
          .object({
            providerId: idSchema,
            serviceId: idSchema,
            from: z.string().trim().min(1).max(64),
            days: z.number().int().min(1).max(14).default(7),
          })
          .strict()
      )
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const from = new Date(input.from);
        if (Number.isNaN(from.getTime())) badRequest('slot_from_invalid');
        const [offering] = await db
          .select({ offering: providerServices, provider: serviceProviders, service: services })
          .from(providerServices)
          .innerJoin(serviceProviders, eq(providerServices.providerId, serviceProviders.id))
          .innerJoin(services, eq(providerServices.serviceId, services.id))
          .where(
            and(
              eq(providerServices.providerId, input.providerId),
              eq(providerServices.serviceId, input.serviceId),
              eq(providerServices.active, true),
              eq(serviceProviders.active, true),
              eq(services.active, true)
            )
          )
          .limit(1);
        if (!offering) notFound('offering_not_found');
        const durationMinutes = offering.offering.durationMinutes ?? offering.service.durationMinutes;
        const windows = await db
          .select()
          .from(providerAvailability)
          .where(and(eq(providerAvailability.providerId, input.providerId), eq(providerAvailability.active, true)))
          .limit(28);
        const rangeEnd = new Date(from.getTime() + input.days * 24 * 60 * 60000);
        const existing = await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.providerId, input.providerId),
              inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
              lt(bookings.scheduledStart, rangeEnd),
              gt(bookings.scheduledEnd, from)
            )
          )
          .limit(500);
        const now = new Date();
        const slots = buildSlotsForWindows({
          windows,
          durationMinutes,
          from,
          days: input.days,
          now,
          existing: existing.map((booking) => ({ start: booking.scheduledStart, end: booking.scheduledEnd })),
        });
        return {
          slots: slots.map((slot) => slot.toISOString()),
          durationMinutes,
          priceMinor: offering.offering.priceMinor ?? offering.service.priceMinor,
          currency: offering.service.currency,
        };
      }),
  }),

  // ── Customer addresses (owner-only) ───────────────────────────────────────
  addresses: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const rows = await db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.userId, ctx.user!.id))
        .orderBy(asc(customerAddresses.createdAt))
        .limit(10);
      return { addresses: rows.map(toPublicAddress) };
    }),

    create: protectedProcedure
      .input(
        z
          .object({
            label: z.string().trim().min(1).max(40),
            line1: z.string().trim().min(1).max(120),
            line2: z.string().trim().max(120).optional(),
            city: z.string().trim().min(1).max(80),
            region: z.string().trim().min(1).max(80),
            postalCode: z.string().trim().min(1).max(20),
            country: z.string().trim().length(2).default('US'),
            instructions: z.string().trim().max(300).optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const existing = await db.select({ id: customerAddresses.id }).from(customerAddresses).where(eq(customerAddresses.userId, ctx.user!.id)).limit(11);
        if (existing.length >= 10) conflict('address_limit_reached');
        const [created] = await db
          .insert(customerAddresses)
          .values({
            id: createId(),
            userId: ctx.user!.id,
            label: input.label,
            line1: input.line1,
            line2: input.line2?.length ? input.line2 : null,
            city: input.city,
            region: input.region,
            postalCode: input.postalCode,
            country: input.country.toUpperCase(),
            instructions: input.instructions?.length ? input.instructions : null,
          })
          .returning();
        return { address: toPublicAddress(created) };
      }),

    update: protectedProcedure
      .input(
        z
          .object({
            addressId: idSchema,
            label: z.string().trim().min(1).max(40).optional(),
            line1: z.string().trim().min(1).max(120).optional(),
            line2: z.string().trim().max(120).nullable().optional(),
            city: z.string().trim().min(1).max(80).optional(),
            region: z.string().trim().min(1).max(80).optional(),
            postalCode: z.string().trim().min(1).max(20).optional(),
            instructions: z.string().trim().max(300).nullable().optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        for (const key of ['label', 'line1', 'city', 'region', 'postalCode'] as const) {
          if (input[key] !== undefined) patch[key] = input[key];
        }
        if (input.line2 !== undefined) patch.line2 = input.line2?.length ? input.line2 : null;
        if (input.instructions !== undefined) patch.instructions = input.instructions?.length ? input.instructions : null;
        const [updated] = await db
          .update(customerAddresses)
          .set(patch)
          .where(and(eq(customerAddresses.id, input.addressId), eq(customerAddresses.userId, ctx.user!.id)))
          .returning();
        if (!updated) notFound('address_not_found');
        return { address: toPublicAddress(updated) };
      }),

    delete: protectedProcedure.input(z.object({ addressId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      // Bookings keep their address snapshot, so deletion never harms history.
      const [deleted] = await db
        .delete(customerAddresses)
        .where(and(eq(customerAddresses.id, input.addressId), eq(customerAddresses.userId, ctx.user!.id)))
        .returning({ id: customerAddresses.id });
      if (!deleted) notFound('address_not_found');
      return { ok: true as const };
    }),
  }),

  // ── Bookings (customer + provider sides) ──────────────────────────────────
  bookings: router({
    create: protectedProcedure
      .input(
        z
          .object({
            offeringId: idSchema,
            addressId: idSchema,
            scheduledStart: z.string().trim().min(1).max(64),
            customerNote: z.string().trim().max(500).optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const start = new Date(input.scheduledStart);
        if (Number.isNaN(start.getTime())) badRequest('booking_start_invalid');
        if (start.getTime() <= Date.now()) badRequest('booking_start_past');

        const created = await db.transaction(async (tx: any) => {
          const [offering] = await tx
            .select({ offering: providerServices, provider: serviceProviders, service: services })
            .from(providerServices)
            .innerJoin(serviceProviders, eq(providerServices.providerId, serviceProviders.id))
            .innerJoin(services, eq(providerServices.serviceId, services.id))
            .where(
              and(
                eq(providerServices.id, input.offeringId),
                eq(providerServices.active, true),
                eq(serviceProviders.active, true),
                eq(services.active, true)
              )
            )
            .limit(1);
          if (!offering) notFound('offering_not_found');

          const [address] = await tx
            .select()
            .from(customerAddresses)
            .where(and(eq(customerAddresses.id, input.addressId), eq(customerAddresses.userId, ctx.user!.id)))
            .limit(1);
          if (!address) forbidden('address_forbidden');

          const durationMinutes = offering.offering.durationMinutes ?? offering.service.durationMinutes;
          const end = new Date(start.getTime() + durationMinutes * 60000);

          // Serialize per-provider booking creation so two concurrent
          // requests cannot both pass the overlap check.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${offering.provider.id}), 7)`);

          // Slot authority: the requested window must sit inside an active
          // availability window (wall-clock, provider timezone).
          const windows = await tx
            .select()
            .from(providerAvailability)
            .where(and(eq(providerAvailability.providerId, offering.provider.id), eq(providerAvailability.active, true)))
            .limit(28);
          const insideWindow = windows.some((window: { weekday: number; startMinutes: number; endMinutes: number; timezone: string }) => {
            const wall = zonedParts(start, window.timezone);
            if (!wall || wall.weekday !== window.weekday) return false;
            const startMinutes = wall.minutes;
            const endWall = new Date(end.getTime());
            const endParts = zonedParts(endWall, window.timezone);
            if (!endParts || endParts.weekday !== window.weekday) return false;
            return startMinutes >= window.startMinutes && endParts.minutes <= window.endMinutes;
          });
          if (!insideWindow) conflict('slot_unavailable');

          const clashes = await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.providerId, offering.provider.id),
                inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
                lt(bookings.scheduledStart, end),
                gt(bookings.scheduledEnd, start)
              )
            )
            .limit(1);
          if (clashes.length > 0) conflict('slot_unavailable');

          const priceMinor = offering.offering.priceMinor ?? offering.service.priceMinor;
          const [row] = await tx
            .insert(bookings)
            .values({
              id: createId(),
              customerId: ctx.user!.id,
              providerId: offering.provider.id,
              serviceId: offering.service.id,
              priceMinor,
              currency: offering.service.currency,
              durationMinutes,
              serviceName: offering.service.name,
              providerName: offering.provider.displayName,
              addressId: address.id,
              addressLabel: address.label,
              addressLine1: address.line1,
              addressCity: address.city,
              addressRegion: address.region,
              addressPostalCode: address.postalCode,
              addressCountry: address.country,
              scheduledStart: start,
              scheduledEnd: end,
              status: 'pending',
              customerNote: input.customerNote?.length ? input.customerNote : null,
            })
            .returning();
          await tx.insert(bookingStatusHistory).values({
            id: createId(),
            bookingId: row.id,
            fromStatus: null,
            toStatus: 'pending',
            actorId: ctx.user!.id,
          });
          return row;
        });

        captureServerEvent(serverMarketplaceAnalytics, 'booking_created', { service_id: created.serviceId });
        const providerAccountId = await providerUserId(db, created.providerId);
        if (providerAccountId && providerAccountId !== ctx.user!.id) {
          await notifyBookingParty(db, {
            userId: providerAccountId,
            title: 'New booking request',
            body: `${created.serviceName} on ${created.scheduledStart.toISOString()}`,
            bookingId: created.id,
          });
        }
        return { booking: toPublicBooking(created) };
      }),

    list: protectedProcedure
      .input(z.object({ scope: bookingScopeSchema, limit: limitSchema, cursor: cursorSchema.optional() }).strict())
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const conditions = [eq(bookings.customerId, ctx.user!.id)];
        let ordering: 'start' | 'created';
        if (input.scope === 'upcoming') {
          conditions.push(inArray(bookings.status, ACTIVE_BOOKING_STATUSES));
          ordering = 'start';
        } else if (input.scope === 'past') {
          conditions.push(eq(bookings.status, 'completed'));
          ordering = 'start';
        } else {
          conditions.push(inArray(bookings.status, ['cancelled', 'rejected']));
          ordering = 'created';
        }
        if (input.cursor) {
          const separator = input.cursor.lastIndexOf('|');
          if (separator <= 0) badRequest('booking_cursor_invalid');
          const key = input.cursor.slice(0, separator);
          const cursorId = input.cursor.slice(separator + 1);
          const keyDate = new Date(key);
          if (Number.isNaN(keyDate.getTime())) badRequest('booking_cursor_invalid');
          if (ordering === 'start') {
            conditions.push(
              or(
                input.scope === 'upcoming' ? gt(bookings.scheduledStart, keyDate) : lt(bookings.scheduledStart, keyDate),
                and(eq(bookings.scheduledStart, keyDate), gt(bookings.id, cursorId))
              )!
            );
          } else {
            conditions.push(or(lt(bookings.createdAt, keyDate), and(eq(bookings.createdAt, keyDate), gt(bookings.id, cursorId)))!);
          }
        }
        const rows = await db
          .select()
          .from(bookings)
          .where(and(...conditions))
          .orderBy(
            ...(ordering === 'start'
              ? (input.scope === 'upcoming' ? [asc(bookings.scheduledStart), asc(bookings.id)] : [desc(bookings.scheduledStart), asc(bookings.id)])
              : [desc(bookings.createdAt), asc(bookings.id)])
          )
          .limit(input.limit + 1);
        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;
        const last = page[page.length - 1];
        return {
          bookings: page.map(toPublicBooking),
          nextCursor:
            hasMore && last
              ? `${(ordering === 'start' ? last.scheduledStart : last.createdAt).toISOString()}|${last.id}`
              : null,
        };
      }),

    get: protectedProcedure.input(z.object({ bookingId: idSchema }).strict()).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking) notFound('booking_not_found');
      const profile = await getOwnProvider(db, ctx.user!.id);
      const isCustomer = booking.customerId === ctx.user!.id;
      const isProvider = profile?.id === booking.providerId;
      if (!isCustomer && !isProvider) forbidden('booking_forbidden');
      const history = await db
        .select()
        .from(bookingStatusHistory)
        .where(eq(bookingStatusHistory.bookingId, booking.id))
        .orderBy(asc(bookingStatusHistory.createdAt))
        .limit(50);
      const [review] = isCustomer
        ? await db.select().from(reviews).where(eq(reviews.bookingId, booking.id)).limit(1)
        : [];
      return {
        booking: toPublicBooking(booking),
        history: history.map((entry) => ({ from: entry.fromStatus, to: entry.toStatus, createdAt: entry.createdAt })),
        review: review ? { id: review.id, rating: review.rating, comment: review.comment } : null,
        permissions: {
          canCancel: isCustomer && ['pending', 'confirmed'].includes(booking.status) && booking.scheduledStart.getTime() > Date.now(),
          providerTransitions: isProvider ? (PROVIDER_TRANSITIONS[booking.status as BookingStatus] ?? []) : [],
        },
      };
    }),

    cancel: protectedProcedure.input(z.object({ bookingId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const updated = await db.transaction(async (tx: any) => {
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
        if (!booking) notFound('booking_not_found');
        if (booking.customerId !== ctx.user!.id) forbidden('booking_forbidden');
        if (!['pending', 'confirmed'].includes(booking.status)) conflict('booking_not_cancellable');
        if (booking.scheduledStart.getTime() <= Date.now()) conflict('booking_not_cancellable');
        const [row] = await tx
          .update(bookings)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(bookings.id, booking.id))
          .returning();
        await tx.insert(bookingStatusHistory).values({
          id: createId(),
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: 'cancelled',
          actorId: ctx.user!.id,
        });
        return row;
      });
      captureServerEvent(serverMarketplaceAnalytics, 'booking_cancelled', {});
      const providerId = await providerUserId(db, updated.providerId);
      if (providerId) {
        await notifyBookingParty(db, {
          userId: providerId,
          title: 'Booking cancelled',
          body: `${updated.serviceName} on ${updated.scheduledStart.toISOString()}`,
          bookingId: updated.id,
        });
      }
      return { booking: toPublicBooking(updated) };
    }),
  }),

  // ── Provider self-service (own profile only) ──────────────────────────────
  provider: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const profile = await getOwnProvider(db, ctx.user!.id);
      return { provider: profile ? toPublicProvider(profile) : null };
    }),

    onboard: protectedProcedure
      .input(
        z
          .object({
            displayName: z.string().trim().min(1).max(80),
            bio: z.string().trim().max(1000).optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const existing = await getOwnProvider(db, ctx.user!.id);
        if (existing) {
          const [updated] = await db
            .update(serviceProviders)
            .set({ displayName: input.displayName, bio: input.bio?.length ? input.bio : null, updatedAt: new Date() })
            .where(eq(serviceProviders.id, existing.id))
            .returning();
          return { provider: toPublicProvider(updated) };
        }
        const [created] = await db
          .insert(serviceProviders)
          .values({
            id: createId(),
            userId: ctx.user!.id,
            displayName: input.displayName,
            bio: input.bio?.length ? input.bio : null,
          })
          .returning();
        return { provider: toPublicProvider(created) };
      }),

    dashboard: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const profile = await getOwnProvider(db, ctx.user!.id);
      if (!profile) forbidden('provider_forbidden');
      const now = new Date();
      const [activeRows, terminalRows, serviceRows] = await Promise.all([
        db
          .select()
          .from(bookings)
          .where(and(eq(bookings.providerId, profile.id), inArray(bookings.status, ACTIVE_BOOKING_STATUSES)))
          .orderBy(asc(bookings.scheduledStart))
          .limit(20),
        db
          .select({ count: sql<number>`count(*)` })
          .from(bookings)
          .where(and(eq(bookings.providerId, profile.id), inArray(bookings.status, TERMINAL_BOOKING_STATUSES))),
        db
          .select()
          .from(providerServices)
          .where(and(eq(providerServices.providerId, profile.id), eq(providerServices.active, true)))
          .limit(50),
      ]);
      return {
        provider: toPublicProvider(profile),
        upcoming: activeRows.map(toPublicBooking),
        completedCount: Number(terminalRows[0]?.count ?? 0),
        activeServiceCount: serviceRows.length,
      };
    }),

    bookings: router({
      list: protectedProcedure
        .input(z.object({ scope: bookingScopeSchema, limit: limitSchema }).strict())
        .query(async ({ ctx, input }) => {
          const db = ctx.db ?? getDb();
          const profile = await getOwnProvider(db, ctx.user!.id);
          if (!profile) forbidden('provider_forbidden');
          const conditions = [eq(bookings.providerId, profile.id)];
          if (input.scope === 'upcoming') {
            conditions.push(inArray(bookings.status, ACTIVE_BOOKING_STATUSES));
          } else if (input.scope === 'past') {
            conditions.push(eq(bookings.status, 'completed'));
          } else {
            conditions.push(inArray(bookings.status, ['cancelled', 'rejected']));
          }
          const rows = await db
            .select()
            .from(bookings)
            .where(and(...conditions))
            .orderBy(input.scope === 'past' ? desc(bookings.scheduledStart) : asc(bookings.scheduledStart))
            .limit(input.limit);
          return { bookings: rows.map(toPublicBooking) };
        }),

      transition: protectedProcedure
        .input(z.object({ bookingId: idSchema, to: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'rejected']) }).strict())
        .mutation(async ({ ctx, input }) => {
          const db = ctx.db ?? getDb();
          const updated = await db.transaction(async (tx: any) => {
            const profile = await getOwnProvider(tx, ctx.user!.id);
            if (!profile) forbidden('provider_forbidden');
            const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
            if (!booking) notFound('booking_not_found');
            if (booking.providerId !== profile.id) forbidden('booking_forbidden');
            const allowed = PROVIDER_TRANSITIONS[booking.status as BookingStatus] ?? [];
            if (!allowed.includes(input.to)) conflict('booking_transition_invalid');
            const [row] = await tx
              .update(bookings)
              .set({ status: input.to, updatedAt: new Date() })
              .where(eq(bookings.id, booking.id))
              .returning();
            await tx.insert(bookingStatusHistory).values({
              id: createId(),
              bookingId: booking.id,
              fromStatus: booking.status,
              toStatus: input.to,
              actorId: ctx.user!.id,
            });
            return row;
          });
          await notifyBookingParty(db, {
            userId: updated.customerId,
            title: `Booking ${input.to.replace('_', ' ')}`,
            body: `${updated.serviceName} on ${updated.scheduledStart.toISOString()}`,
            bookingId: updated.id,
          });
          if (input.to === 'completed') {
            await notifyBookingParty(db, {
              userId: updated.customerId,
              title: 'How was your service?',
              body: `Leave a review for ${updated.providerName}.`,
              bookingId: updated.id,
            });
          }
          return { booking: toPublicBooking(updated) };
        }),
    }),

    services: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = ctx.db ?? getDb();
        const profile = await getOwnProvider(db, ctx.user!.id);
        if (!profile) forbidden('provider_forbidden');
        const rows = await db
          .select({ offering: providerServices, service: services })
          .from(providerServices)
          .innerJoin(services, eq(providerServices.serviceId, services.id))
          .where(eq(providerServices.providerId, profile.id))
          .limit(50);
        return {
          offerings: rows.map(({ offering, service }) => ({
            id: offering.id,
            active: offering.active,
            service: toPublicService(service),
            priceMinor: offering.priceMinor ?? service.priceMinor,
            durationMinutes: offering.durationMinutes ?? service.durationMinutes,
          })),
        };
      }),

      add: protectedProcedure
        .input(
          z
            .object({
              serviceId: idSchema,
              priceMinor: z.number().int().min(0).max(100_000_00).optional(),
              durationMinutes: z.number().int().min(15).max(480).optional(),
            })
            .strict()
        )
        .mutation(async ({ ctx, input }) => {
          const db = ctx.db ?? getDb();
          const profile = await getOwnProvider(db, ctx.user!.id);
          if (!profile) forbidden('provider_forbidden');
          const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
          if (!service) notFound('service_not_found');
          const [created] = await db
            .insert(providerServices)
            .values({
              id: createId(),
              providerId: profile.id,
              serviceId: service.id,
              priceMinor: input.priceMinor ?? null,
              durationMinutes: input.durationMinutes ?? null,
            })
            .onConflictDoNothing()
            .returning();
          if (created) return { offeringId: created.id, created: true as const };
          const [existing] = await db
            .select()
            .from(providerServices)
            .where(and(eq(providerServices.providerId, profile.id), eq(providerServices.serviceId, service.id)))
            .limit(1);
          return { offeringId: existing.id, created: false as const };
        }),

      remove: protectedProcedure.input(z.object({ offeringId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const profile = await getOwnProvider(db, ctx.user!.id);
        if (!profile) forbidden('provider_forbidden');
        // Deactivate rather than delete: preserves referential meaning for
        // any future non-terminal booking referencing the offering.
        const [updated] = await db
          .update(providerServices)
          .set({ active: false })
          .where(and(eq(providerServices.id, input.offeringId), eq(providerServices.providerId, profile.id)))
          .returning({ id: providerServices.id });
        if (!updated) notFound('offering_not_found');
        return { ok: true as const };
      }),
    }),

    availability: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = ctx.db ?? getDb();
        const profile = await getOwnProvider(db, ctx.user!.id);
        if (!profile) forbidden('provider_forbidden');
        const rows = await db
          .select()
          .from(providerAvailability)
          .where(eq(providerAvailability.providerId, profile.id))
          .orderBy(asc(providerAvailability.weekday), asc(providerAvailability.startMinutes))
          .limit(28);
        return {
          windows: rows.map((window: { id: string; weekday: number; startMinutes: number; endMinutes: number; timezone: string; active: boolean }) => ({
            id: window.id,
            weekday: window.weekday,
            startMinutes: window.startMinutes,
            endMinutes: window.endMinutes,
            timezone: window.timezone,
            active: window.active,
          })),
        };
      }),

      add: protectedProcedure
        .input(
          z
            .object({
              weekday: z.number().int().min(0).max(6),
              startMinutes: z.number().int().min(0).max(1439),
              endMinutes: z.number().int().min(1).max(1440),
              timezone: z.string().trim().min(1).max(64),
            })
            .strict()
        )
        .mutation(async ({ ctx, input }) => {
          const db = ctx.db ?? getDb();
          const profile = await getOwnProvider(db, ctx.user!.id);
          if (!profile) forbidden('provider_forbidden');
          if (input.startMinutes >= input.endMinutes) badRequest('availability_window_invalid');
          if (!isSupportedTimeZone(input.timezone)) badRequest('availability_timezone_invalid');
          const existing = await db
            .select({ id: providerAvailability.id })
            .from(providerAvailability)
            .where(eq(providerAvailability.providerId, profile.id))
            .limit(29);
          if (existing.length >= 28) conflict('availability_limit_reached');
          const [created] = await db
            .insert(providerAvailability)
            .values({
              id: createId(),
              providerId: profile.id,
              weekday: input.weekday,
              startMinutes: input.startMinutes,
              endMinutes: input.endMinutes,
              timezone: input.timezone,
            })
            .returning();
          return { windowId: created.id };
        }),

      remove: protectedProcedure.input(z.object({ windowId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const profile = await getOwnProvider(db, ctx.user!.id);
        if (!profile) forbidden('provider_forbidden');
        const [deleted] = await db
          .delete(providerAvailability)
          .where(and(eq(providerAvailability.id, input.windowId), eq(providerAvailability.providerId, profile.id)))
          .returning({ id: providerAvailability.id });
        if (!deleted) notFound('availability_not_found');
        return { ok: true as const };
      }),
    }),
  }),

  // ── Reviews (customer, completed bookings only, one per booking) ──────────
  reviews: router({
    create: protectedProcedure
      .input(
        z
          .object({
            bookingId: idSchema,
            rating: z.number().int().min(1).max(5),
            comment: z.string().trim().max(500).optional(),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const created = await db.transaction(async (tx: any) => {
          const [booking] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
          if (!booking) notFound('booking_not_found');
          if (booking.customerId !== ctx.user!.id) forbidden('review_forbidden');
          if (booking.status !== 'completed') conflict('review_booking_not_completed');
          try {
            const [review] = await tx
              .insert(reviews)
              .values({
                id: createId(),
                bookingId: booking.id,
                customerId: ctx.user!.id,
                providerId: booking.providerId,
                rating: input.rating,
                comment: input.comment?.length ? input.comment : null,
              })
              .returning();
            await tx.execute(
              sql`UPDATE service_providers SET rating_sum = rating_sum + ${input.rating}, rating_count = rating_count + 1, updated_at = now() WHERE id = ${booking.providerId}`
            );
            return review;
          } catch (error) {
            if (isUniqueViolation(error)) conflict('review_already_exists');
            throw error;
          }
        });
        captureServerEvent(serverMarketplaceAnalytics, 'review_submitted', {});
        return { review: { id: created.id, rating: created.rating } };
      }),
  }),

  // ── Favorites (owner-only, typed tables) ──────────────────────────────────
  favorites: router({
    services: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = ctx.db ?? getDb();
        const rows = await db
          .select({ favorite: favoriteServices, service: services })
          .from(favoriteServices)
          .innerJoin(services, eq(favoriteServices.serviceId, services.id))
          .where(and(eq(favoriteServices.userId, ctx.user!.id), eq(services.active, true)))
          .limit(100);
        return { services: rows.map(({ service }) => toPublicService(service)) };
      }),

      toggle: protectedProcedure.input(z.object({ serviceId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [service] = await db.select({ id: services.id }).from(services).where(eq(services.id, input.serviceId)).limit(1);
        if (!service) notFound('service_not_found');
        try {
          await db.insert(favoriteServices).values({ id: createId(), userId: ctx.user!.id, serviceId: service.id });
          captureServerEvent(serverMarketplaceAnalytics, 'favorite_changed', { target: 'service', favorited: true });
          return { favorited: true as const };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          await db
            .delete(favoriteServices)
            .where(and(eq(favoriteServices.userId, ctx.user!.id), eq(favoriteServices.serviceId, service.id)));
          captureServerEvent(serverMarketplaceAnalytics, 'favorite_changed', { target: 'service', favorited: false });
          return { favorited: false as const };
        }
      }),
    }),

    providers: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = ctx.db ?? getDb();
        const rows = await db
          .select({ favorite: favoriteProviders, provider: serviceProviders })
          .from(favoriteProviders)
          .innerJoin(serviceProviders, eq(favoriteProviders.providerId, serviceProviders.id))
          .where(eq(favoriteProviders.userId, ctx.user!.id))
          .limit(100);
        return { providers: rows.map(({ provider }) => toPublicProvider(provider)) };
      }),

      toggle: protectedProcedure.input(z.object({ providerId: idSchema }).strict()).mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [provider] = await db.select({ id: serviceProviders.id }).from(serviceProviders).where(eq(serviceProviders.id, input.providerId)).limit(1);
        if (!provider) notFound('provider_not_found');
        try {
          await db.insert(favoriteProviders).values({ id: createId(), userId: ctx.user!.id, providerId: provider.id });
          captureServerEvent(serverMarketplaceAnalytics, 'favorite_changed', { target: 'provider', favorited: true });
          return { favorited: true as const };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          await db
            .delete(favoriteProviders)
            .where(and(eq(favoriteProviders.userId, ctx.user!.id), eq(favoriteProviders.providerId, provider.id)));
          captureServerEvent(serverMarketplaceAnalytics, 'favorite_changed', { target: 'provider', favorited: false });
          return { favorited: false as const };
        }
      }),
    }),
  }),
});

async function providerUserId(db: any, providerId: string): Promise<string | null> {
  const [profile] = await db.select({ userId: serviceProviders.userId }).from(serviceProviders).where(eq(serviceProviders.id, providerId)).limit(1);
  return profile?.userId ?? null;
}

// Re-exported for unit tests of the slot/timezone math.
export { ACTIVE_BOOKING_STATUSES, PROVIDER_TRANSITIONS };
export type { AvailabilityWindow };
