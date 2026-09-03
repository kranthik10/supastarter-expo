import { describe, expect, it } from 'vitest';
import { appRouter } from './router';
import {
  PROVIDER_TRANSITIONS,
  buildSlotsForWindows,
  isSupportedTimeZone,
  zonedParts,
  zonedTimeToUtc,
} from './marketplace';

const authedContext = (overrides: Record<string, unknown> = {}) => ({
  db: {} as any,
  user: { id: 'user-1', email: 'user@example.com', emailVerified: true, name: 'User', image: null } as any,
  sessionId: 'session-1',
  headers: {},
  ...overrides,
});

const throwingDb = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('database should not be touched');
    },
  }
) as any;

/** Chainable mock: select/insert/update/delete → from/where/set/values/innerJoin → limit/returning. */
const chainDb = (selectValue: unknown, writeValue: unknown = []) => {
  const terminal = async () => selectValue;
  const returning = async () => writeValue;
  const node: any = {};
  node.from = () => node;
  node.where = () => node;
  node.orderBy = () => node;
  node.innerJoin = () => node;
  node.set = () => node;
  node.values = () => node;
  node.limit = terminal;
  node.returning = returning;
  return {
    select: () => node,
    insert: () => node,
    update: () => node,
    delete: () => node,
    execute: async () => [],
    transaction: async (fn: any) => fn({ select: () => node, insert: () => node, update: () => node, delete: () => node, execute: async () => [] }),
  } as any;
};

describe('marketplace API contract', () => {
  it('exposes the marketplace procedure surface', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    for (const path of [
      'marketplace.categories.list',
      'marketplace.services.list',
      'marketplace.services.get',
      'marketplace.providers.get',
      'marketplace.providers.reviews.list',
      'marketplace.availability.slots',
      'marketplace.addresses.list',
      'marketplace.addresses.create',
      'marketplace.addresses.update',
      'marketplace.addresses.delete',
      'marketplace.bookings.create',
      'marketplace.bookings.list',
      'marketplace.bookings.get',
      'marketplace.bookings.cancel',
      'marketplace.provider.me',
      'marketplace.provider.onboard',
      'marketplace.provider.dashboard',
      'marketplace.provider.bookings.list',
      'marketplace.provider.bookings.transition',
      'marketplace.provider.services.list',
      'marketplace.provider.services.add',
      'marketplace.provider.services.remove',
      'marketplace.provider.availability.list',
      'marketplace.provider.availability.add',
      'marketplace.provider.availability.remove',
      'marketplace.reviews.create',
      'marketplace.favorites.services.list',
      'marketplace.favorites.services.toggle',
      'marketplace.favorites.providers.list',
      'marketplace.favorites.providers.toggle',
    ]) {
      expect(procedures, path).toHaveProperty(path);
    }
  });

  it('rejects unauthenticated marketplace access', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.marketplace.categories.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.marketplace.services.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      caller.marketplace.bookings.create({ offeringId: 'o', addressId: 'a', scheduledStart: new Date(Date.now() + 86400000).toISOString() })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.marketplace.provider.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.marketplace.reviews.create({ bookingId: 'b', rating: 5 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.marketplace.favorites.services.toggle({ serviceId: 's' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects past and malformed booking starts before any database write', async () => {
    const caller = appRouter.createCaller(authedContext({ db: throwingDb }));
    await expect(
      caller.marketplace.bookings.create({ offeringId: 'o', addressId: 'a', scheduledStart: new Date(Date.now() - 1000).toISOString() })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.marketplace.bookings.create({ offeringId: 'o', addressId: 'a', scheduledStart: 'not-a-date' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid service sort and cursor values', async () => {
    const caller = appRouter.createCaller(authedContext({ db: throwingDb }));
    await expect(caller.marketplace.services.list({ sort: 'popular' as never })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.marketplace.services.list({ cursor: 'no-separator' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.marketplace.services.list({ cursor: 'abc|def' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects degraded availability windows and unknown timezones', async () => {
    const profile = { id: 'prov-1', userId: 'user-1' };
    const caller = appRouter.createCaller(authedContext({ db: chainDb([profile]) }));
    await expect(caller.marketplace.provider.availability.add({ weekday: 1, startMinutes: 600, endMinutes: 600, timezone: 'UTC' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.marketplace.provider.availability.add({ weekday: 1, startMinutes: 600, endMinutes: 660, timezone: 'Mars/Olympus' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.marketplace.provider.availability.add({ weekday: 7, startMinutes: 600, endMinutes: 660, timezone: 'UTC' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects out-of-range review ratings without touching the database', async () => {
    const caller = appRouter.createCaller(authedContext({ db: throwingDb }));
    await expect(caller.marketplace.reviews.create({ bookingId: 'b', rating: 0 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.marketplace.reviews.create({ bookingId: 'b', rating: 6 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('scopes provider offering removal to the caller\u2019s own profile', async () => {
    const profile = { id: 'prov-1', userId: 'user-1' };
    const db = chainDb([profile], []);
    const caller = appRouter.createCaller(authedContext({ db }));
    await expect(caller.marketplace.provider.services.remove({ offeringId: 'other-offering' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('denies provider procedures for users without a provider profile', async () => {
    const caller = appRouter.createCaller(authedContext({ db: chainDb([]) }));
    await expect(caller.marketplace.provider.dashboard()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.marketplace.provider.bookings.list({ scope: 'upcoming' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('marketplace lifecycle map', () => {
  it('allows only the documented provider transitions', () => {
    expect(PROVIDER_TRANSITIONS.pending).toEqual(['confirmed', 'rejected']);
    expect(PROVIDER_TRANSITIONS.confirmed).toEqual(['in_progress', 'cancelled']);
    expect(PROVIDER_TRANSITIONS.in_progress).toEqual(['completed']);
    expect(PROVIDER_TRANSITIONS.completed).toEqual([]);
    expect(PROVIDER_TRANSITIONS.cancelled).toEqual([]);
    expect(PROVIDER_TRANSITIONS.rejected).toEqual([]);
  });
});

describe('marketplace timezone math', () => {
  it('validates IANA timezone names', () => {
    expect(isSupportedTimeZone('UTC')).toBe(true);
    expect(isSupportedTimeZone('Europe/Berlin')).toBe(true);
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false);
  });

  it('resolves weekday and minutes in the provider timezone', () => {
    // 2026-09-03 12:00 UTC is a Thursday.
    const noon = new Date('2026-09-03T12:00:00.000Z');
    expect(zonedParts(noon, 'UTC')).toEqual({ weekday: 4, minutes: 720 });
    // EDT (UTC-4): 08:00 local.
    expect(zonedParts(noon, 'America/New_York')).toEqual({ weekday: 4, minutes: 480 });
    expect(zonedParts(noon, 'Mars/Olympus')).toBeNull();
  });

  it('round-trips wall-clock times through the provider timezone', () => {
    // 09:30 in Berlin (CET, UTC+1 in January) is 08:30 UTC.
    const utc = zonedTimeToUtc(2026, 1, 15, 570, 'Europe/Berlin');
    expect(utc?.toISOString()).toBe('2026-01-15T08:30:00.000Z');
  });

  it('builds half-hour slots inside windows and excludes overlaps and the past', () => {
    const now = new Date('2026-09-07T08:00:00.000Z'); // Monday
    const from = new Date('2026-09-07T00:00:00.000Z');
    const windows = [{ weekday: 1, startMinutes: 540, endMinutes: 720, timezone: 'UTC' }]; // Mon 09:00–12:00
    const slots = buildSlotsForWindows({
      windows,
      durationMinutes: 60,
      from,
      days: 1,
      now,
      existing: [{ start: new Date('2026-09-07T10:00:00.000Z'), end: new Date('2026-09-07T11:00:00.000Z') }],
    });
    const iso = slots.map((slot) => slot.toISOString());
    // 09:00 fits (ends exactly at 10:00); 09:30 would end 10:30 and clash;
    // 10:00/10:30 overlap the existing booking; 11:00 fits.
    expect(iso).toEqual(['2026-09-07T09:00:00.000Z', '2026-09-07T11:00:00.000Z']);
  });

  it('returns no slots when the window cannot fit the duration', () => {
    const now = new Date('2026-09-07T08:00:00.000Z');
    const slots = buildSlotsForWindows({
      windows: [{ weekday: 1, startMinutes: 540, endMinutes: 570, timezone: 'UTC' }],
      durationMinutes: 60,
      from: new Date('2026-09-07T00:00:00.000Z'),
      days: 1,
      now,
      existing: [],
    });
    expect(slots).toEqual([]);
  });
});
