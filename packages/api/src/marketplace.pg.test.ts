import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@repo/database';
import {
  bookings,
  customerAddresses,
  providerAvailability,
  providerServices,
  serviceCategories,
  serviceProviders,
  services,
  users,
} from '@repo/database';
import { eq, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { appRouter } from './router';

// Real-PostgreSQL marketplace isolation proofs. Skipped when DATABASE_URL
// is absent (e.g. CI without a database); run locally with the dev env.
const DATABASE_URL = process.env.DATABASE_URL;
const describePg = DATABASE_URL ? describe : describe.skip;

const suffix = `${Date.now().toString(36)}`;
const email = (who: string): string => `mkt-${who}-${suffix}@example.com`;

const callerFor = (db: any, userId: string, userEmail: string) =>
  appRouter.createCaller({
    db,
    user: { id: userId, email: userEmail, emailVerified: true, name: userEmail, image: null } as any,
    sessionId: 'session-test',
    headers: {},
  });

const tomorrowAt = (hour: number): Date => {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  day.setUTCHours(hour, 0, 0, 0);
  return day;
};

describePg('marketplace PostgreSQL isolation', () => {
  const db = getDb(DATABASE_URL);
  const ids = {
    customers: [] as string[],
    providers: [] as string[],
    services: [] as string[],
    categories: [] as string[],
  };
  let custA = '';
  let custB = '';
  let provUserA = '';
  let provUserB = '';
  let providerA = '';
  let providerB = '';
  let serviceId = '';
  let offeringA = '';
  let offeringB = '';
  let addressA = '';
  let addressB = '';

  beforeAll(async () => {
    const mkUser = async (who: string): Promise<string> => {
      const id = createId();
      await db.insert(users).values({ id, email: email(who), name: who, emailVerified: true });
      return id;
    };
    custA = await mkUser('cust-a');
    custB = await mkUser('cust-b');
    provUserA = await mkUser('prov-a');
    provUserB = await mkUser('prov-b');
    ids.customers.push(custA, custB);
    ids.providers.push(provUserA, provUserB);

    const categoryId = createId();
    await db.insert(serviceCategories).values({ id: categoryId, name: `Cleaning ${suffix}`, slug: `cleaning-${suffix}`, icon: 'sparkles', displayOrder: 0 });
    ids.categories.push(categoryId);

    serviceId = createId();
    await db.insert(services).values({
      id: serviceId,
      categoryId,
      name: `Deep Clean ${suffix}`,
      durationMinutes: 60,
      priceMinor: 7500,
      currency: 'USD',
      displayOrder: 0,
    });
    ids.services.push(serviceId);

    providerA = createId();
    providerB = createId();
    await db.insert(serviceProviders).values({ id: providerA, userId: provUserA, displayName: 'Provider A' });
    await db.insert(serviceProviders).values({ id: providerB, userId: provUserB, displayName: 'Provider B' });

    offeringA = createId();
    offeringB = createId();
    await db.insert(providerServices).values({ id: offeringA, providerId: providerA, serviceId });
    await db.insert(providerServices).values({ id: offeringB, providerId: providerB, serviceId });

    // Full-day UTC windows every weekday: any future slot is inside a window.
    for (const providerId of [providerA, providerB]) {
      for (let weekday = 0; weekday < 7; weekday += 1) {
        await db.insert(providerAvailability).values({ id: createId(), providerId, weekday, startMinutes: 0, endMinutes: 1440, timezone: 'UTC' });
      }
    }

    const [a] = await db
      .insert(customerAddresses)
      .values({ id: createId(), userId: custA, label: 'Home', line1: '1 Test St', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' })
      .returning();
    const [b] = await db
      .insert(customerAddresses)
      .values({ id: createId(), userId: custB, label: 'Home', line1: '2 Test St', city: 'Austin', region: 'TX', postalCode: '78702', country: 'US' })
      .returning();
    addressA = a.id;
    addressB = b.id;
  }, 60000);

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, ids.customers));
    await db.delete(users).where(inArray(users.id, ids.providers));
    await db.delete(services).where(inArray(services.id, ids.services));
    await db.delete(serviceCategories).where(inArray(serviceCategories.id, ids.categories));
  });

  it('creates a booking at the catalog price and hides the slot afterwards', async () => {
    const caller = callerFor(db, custA, email('cust-a'));
    const start = tomorrowAt(10);
    const before = await caller.marketplace.availability.slots({ providerId: providerA, serviceId, from: start.toISOString(), days: 1 });
    expect(before.slots).toContain(start.toISOString());
    const created = await caller.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: start.toISOString() });
    expect(created.booking.priceMinor).toBe(7500);
    expect(created.booking.status).toBe('pending');
    const after = await caller.marketplace.availability.slots({ providerId: providerA, serviceId, from: start.toISOString(), days: 1 });
    expect(after.slots).not.toContain(start.toISOString());
  });

  it('keeps the price snapshot when the catalog price changes', async () => {
    const caller = callerFor(db, custA, email('cust-a'));
    const start = tomorrowAt(12);
    const created = await caller.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: start.toISOString() });
    await db.update(services).set({ priceMinor: 9900 }).where(eq(services.id, serviceId));
    const fetched = await caller.marketplace.bookings.get({ bookingId: created.booking.id });
    expect(fetched.booking.priceMinor).toBe(7500);
  });

  it('denies customer B every access to customer A bookings and addresses', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerB = callerFor(db, custB, email('cust-b'));
    const created = await callerA.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: tomorrowAt(14).toISOString() });
    await expect(callerB.marketplace.bookings.get({ bookingId: created.booking.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(callerB.marketplace.bookings.cancel({ bookingId: created.booking.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const listB = await callerB.marketplace.bookings.list({ scope: 'upcoming' });
    expect(listB.bookings.map((booking) => booking.id)).not.toContain(created.booking.id);
    await expect(callerB.marketplace.addresses.update({ addressId: addressA, label: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(callerB.marketplace.addresses.delete({ addressId: addressA })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects double booking of the same slot, including concurrent attempts', async () => {
    const caller = callerFor(db, custA, email('cust-a'));
    const start = tomorrowAt(16).toISOString();
    await caller.marketplace.bookings.create({ offeringId: offeringB, addressId: addressA, scheduledStart: start });
    await expect(caller.marketplace.bookings.create({ offeringId: offeringB, addressId: addressA, scheduledStart: start })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const later = tomorrowAt(17).toISOString();
    const attempts = await Promise.allSettled([
      caller.marketplace.bookings.create({ offeringId: offeringB, addressId: addressA, scheduledStart: later }),
      caller.marketplace.bookings.create({ offeringId: offeringB, addressId: addressA, scheduledStart: later }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });
  });

  it('isolates providers: no cross-reads, no cross-transitions, no cross-availability edits', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerProvA = callerFor(db, provUserA, email('prov-a'));
    const callerProvB = callerFor(db, provUserB, email('prov-b'));
    const created = await callerA.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: tomorrowAt(18).toISOString() });
    await expect(callerProvB.marketplace.provider.bookings.transition({ bookingId: created.booking.id, to: 'confirmed' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const listB = await callerProvB.marketplace.provider.bookings.list({ scope: 'upcoming' });
    expect(listB.bookings.map((booking) => booking.id)).not.toContain(created.booking.id);
    const windowsA = await callerProvA.marketplace.provider.availability.list();
    expect(windowsA.windows.length).toBeGreaterThan(0);
    await expect(callerProvB.marketplace.provider.availability.remove({ windowId: windowsA.windows[0]!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Customer has no provider transition authority at all.
    await expect(callerA.marketplace.provider.bookings.transition({ bookingId: created.booking.id, to: 'confirmed' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('enforces the full provider lifecycle and customer cancellation rules', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerProvA = callerFor(db, provUserA, email('prov-a'));
    const created = await callerA.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: tomorrowAt(19).toISOString() });
    // Illegal jump pending → completed.
    await expect(callerProvA.marketplace.provider.bookings.transition({ bookingId: created.booking.id, to: 'completed' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: created.booking.id, to: 'confirmed' });
    // Customer cancels a confirmed future booking.
    const cancelled = await callerA.marketplace.bookings.cancel({ bookingId: created.booking.id });
    expect(cancelled.booking.status).toBe('cancelled');
    await expect(callerA.marketplace.bookings.cancel({ bookingId: created.booking.id })).rejects.toMatchObject({ code: 'CONFLICT' });

    const second = await callerA.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: tomorrowAt(20).toISOString() });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: second.booking.id, to: 'confirmed' });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: second.booking.id, to: 'in_progress' });
    // In-progress bookings are no longer customer-cancellable.
    await expect(callerA.marketplace.bookings.cancel({ bookingId: second.booking.id })).rejects.toMatchObject({ code: 'CONFLICT' });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: second.booking.id, to: 'completed' });
    await expect(callerA.marketplace.bookings.cancel({ bookingId: second.booking.id })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows exactly one review per completed booking, by its own customer', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerB = callerFor(db, custB, email('cust-b'));
    const callerProvA = callerFor(db, provUserA, email('prov-a'));
    const pending = await callerA.marketplace.bookings.create({ offeringId: offeringA, addressId: addressA, scheduledStart: tomorrowAt(21).toISOString() });
    await expect(callerA.marketplace.reviews.create({ bookingId: pending.booking.id, rating: 5 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: pending.booking.id, to: 'confirmed' });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: pending.booking.id, to: 'in_progress' });
    await callerProvA.marketplace.provider.bookings.transition({ bookingId: pending.booking.id, to: 'completed' });
    await expect(callerB.marketplace.reviews.create({ bookingId: pending.booking.id, rating: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await callerA.marketplace.reviews.create({ bookingId: pending.booking.id, rating: 5, comment: 'Excellent work.' });
    await expect(callerA.marketplace.reviews.create({ bookingId: pending.booking.id, rating: 4 })).rejects.toMatchObject({ code: 'CONFLICT' });
    const profile = await callerProvA.marketplace.provider.me();
    expect(profile.provider?.rating).toMatchObject({ average: 5, count: 1 });
  });

  it('keeps favorites per-user and idempotent', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerB = callerFor(db, custB, email('cust-b'));
    expect(await callerA.marketplace.favorites.services.toggle({ serviceId })).toMatchObject({ favorited: true });
    expect(await callerA.marketplace.favorites.services.toggle({ serviceId })).toMatchObject({ favorited: false });
    await callerA.marketplace.favorites.providers.toggle({ providerId: providerA });
    const listB = await callerB.marketplace.favorites.providers.list();
    expect(listB.providers).toHaveLength(0);
    const listA = await callerA.marketplace.favorites.providers.list();
    expect(listA.providers.map((provider) => provider.id)).toContain(providerA);
  });

  it('enforces the address ownership boundary and the per-user cap', async () => {
    const callerA = callerFor(db, custA, email('cust-a'));
    const callerB = callerFor(db, custB, email('cust-b'));
    // custB already owns addressB (1 of 10); fill to the cap.
    for (let i = 0; i < 9; i += 1) {
      await callerB.marketplace.addresses.create({ label: `Place ${i}`, line1: `${i} Main St`, city: 'Austin', region: 'TX', postalCode: '78701' });
    }
    await expect(
      callerB.marketplace.addresses.create({ label: 'Overflow', line1: '99 Main St', city: 'Austin', region: 'TX', postalCode: '78701' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    // Bookings keep their address snapshot: delete the address used for a
    // booking, and the booking still shows the full address.
    const throwaway = await callerA.marketplace.addresses.create({ label: 'Studio', line1: '9 Loft Ave', city: 'Austin', region: 'TX', postalCode: '78703' });
    const booked = await callerA.marketplace.bookings.create({
      offeringId: offeringA,
      addressId: throwaway.address.id,
      scheduledStart: tomorrowAt(22).toISOString(),
    });
    await callerA.marketplace.addresses.delete({ addressId: throwaway.address.id });
    const fetched = await callerA.marketplace.bookings.get({ bookingId: booked.booking.id });
    expect(fetched.booking.address).toMatchObject({ label: 'Studio', line1: '9 Loft Ave', city: 'Austin' });
    void addressB;
  });
});
