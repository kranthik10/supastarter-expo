import { createId } from '@paralleldrive/cuid2';
import { getDb } from './index';
import {
  bookings,
  customerAddresses,
  providerAvailability,
  providerServices,
  reviews,
  roles,
  permissions,
  rolePermissions,
  plans,
  serviceCategories,
  serviceProviders,
  services,
  users,
  organizations,
  organizationMembers,
} from './schema';

const PERMISSIONS: { key: string; description: string }[] = [
  { key: 'organization.read', description: 'View organization' },
  { key: 'organization.update', description: 'Update organization' },
  { key: 'organization.delete', description: 'Delete organization' },
  { key: 'members.read', description: 'View members' },
  { key: 'members.invite', description: 'Invite members' },
  { key: 'members.remove', description: 'Remove members' },
  { key: 'members.update', description: 'Change member roles' },
  { key: 'billing.read', description: 'View billing' },
  { key: 'billing.manage', description: 'Manage billing' },
  { key: 'files.write', description: 'Upload files' },
  { key: 'files.delete', description: 'Delete files' },
];

const ROLES: { key: 'owner' | 'admin' | 'member'; name: string; perms: string[] }[] = [
  {
    key: 'owner',
    name: 'Owner',
    perms: PERMISSIONS.map((p) => p.key),
  },
  {
    key: 'admin',
    name: 'Admin',
    perms: ['organization.read', 'organization.update', 'members.read', 'members.invite', 'members.remove', 'billing.read', 'files.write', 'files.delete'],
  },
  {
    key: 'member',
    name: 'Member',
    perms: ['organization.read', 'members.read', 'billing.read', 'files.write'],
  },
];

const PLANS = [
  { id: 'free', name: 'Free', priceCents: 0, seats: 1 },
  { id: 'pro', name: 'Pro', priceCents: 1900, seats: 10 },
  { id: 'enterprise', name: 'Enterprise', priceCents: 9900, seats: 100 },
] as const;

async function seed() {
  const db = getDb();
  console.log('Seeding database...');

  for (const p of PERMISSIONS) {
    await db
      .insert(permissions)
      .values({ id: createId(), key: p.key, description: p.description })
      .onConflictDoNothing();
  }
  console.log(`  permissions: ${PERMISSIONS.length}`);

  for (const r of ROLES) {
    await db.insert(roles).values({ id: createId(), key: r.key, name: r.name }).onConflictDoNothing();
  }
  console.log(`  roles: ${ROLES.length}`);

  const roleRows = await db.select().from(roles);
  const permRows = await db.select().from(permissions);
  const roleByKey = new Map(roleRows.map((r) => [r.key, r]));
  const permByKey = new Map(permRows.map((p) => [p.key, p]));

  for (const r of ROLES) {
    const role = roleByKey.get(r.key);
    if (!role) continue;
    for (const permKey of r.perms) {
      const perm = permByKey.get(permKey);
      if (!perm) continue;
      await db.insert(rolePermissions).values({ roleId: role.id, permissionId: perm.id }).onConflictDoNothing();
    }
  }
  console.log('  role_permissions: seeded');

  for (const plan of PLANS) {
    await db
      .insert(plans)
      .values({ id: plan.id, name: plan.name, priceCents: plan.priceCents, seats: plan.seats, provider: 'stripe' })
      .onConflictDoNothing();
  }
  console.log(`  plans: ${PLANS.length}`);

  const demoEmail = 'demo@example.com';
  const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, demoEmail) });
  let demoUserId: string;
  if (!existing) {
    const id = createId();
    await db.insert(users).values({ id, email: demoEmail, name: 'Demo User', emailVerified: true });
    demoUserId = id;
    console.log('  demo user created:', demoEmail);
  } else {
    demoUserId = existing.id;
    console.log('  demo user exists');
  }

  const demoOrg = await db.query.organizations.findFirst({ where: (o, { eq }) => eq(o.slug, 'demo') });
  let orgId: string;
  if (!demoOrg) {
    orgId = createId();
    await db.insert(organizations).values({ id: orgId, name: 'Demo Organization', slug: 'demo' });
    await db.insert(organizationMembers).values({ id: createId(), organizationId: orgId, userId: demoUserId, role: 'owner' });
    console.log('  demo organization created: demo');
  } else {
    console.log('  demo organization exists');
  }

  console.log('Seed complete.');
  await seedMarketplace(db);
}

// ── ServiceHub marketplace demo catalog (Phase 6) ──────────────────────────
// Deterministic fixed IDs make re-runs idempotent. Demo people are
// fictional; descriptions are original. Provider users have no credentials
// (sign up as a customer to try booking; onboard as a provider to try the
// provider surface).

const MARKETPLACE_CATEGORIES = [
  { id: 'mkt-cat-cleaning', name: 'Cleaning', slug: 'cleaning', description: 'Home and deep cleaning by background-checked pros.', icon: 'sparkles', displayOrder: 0 },
  { id: 'mkt-cat-beauty', name: 'Beauty & Wellness', slug: 'beauty-wellness', description: 'Salon services at home, on your schedule.', icon: 'scissors', displayOrder: 1 },
  { id: 'mkt-cat-plumbing', name: 'Plumbing', slug: 'plumbing', description: 'Leaks, fittings, and installations fixed right.', icon: 'wrench', displayOrder: 2 },
  { id: 'mkt-cat-electrical', name: 'Electrical', slug: 'electrical', description: 'Certified electricians for repairs and upgrades.', icon: 'zap', displayOrder: 3 },
  { id: 'mkt-cat-appliance', name: 'Appliance Repair', slug: 'appliance-repair', description: 'Diagnostics and repair for major home appliances.', icon: 'refrigerator', displayOrder: 4 },
  { id: 'mkt-cat-painting', name: 'Painting', slug: 'painting', description: 'Interior and exterior painting with clean finishes.', icon: 'paint-roller', displayOrder: 5 },
  { id: 'mkt-cat-handyman', name: 'Handyman', slug: 'handyman', description: 'Furniture, mounting, and everyday home fixes.', icon: 'hammer', displayOrder: 6 },
] as const;

const MARKETPLACE_SERVICES = [
  { id: 'mkt-svc-deep-clean', categoryId: 'mkt-cat-cleaning', name: 'Deep Home Cleaning', description: 'Top-to-bottom deep clean: kitchen, bathrooms, bedrooms, and living areas, including inside cabinets on request.', durationMinutes: 180, priceMinor: 12900, displayOrder: 0 },
  { id: 'mkt-svc-bathroom-clean', categoryId: 'mkt-cat-cleaning', name: 'Bathroom Deep Clean', description: 'Descaling, grout scrubbing, fixture polishing, and mirror detailing for up to two bathrooms.', durationMinutes: 90, priceMinor: 5900, displayOrder: 1 },
  { id: 'mkt-svc-sofa-clean', categoryId: 'mkt-cat-cleaning', name: 'Sofa & Carpet Shampoo', description: 'Hot-water extraction shampoo for sofas and carpets with pet-safe detergents.', durationMinutes: 120, priceMinor: 8900, displayOrder: 2 },
  { id: 'mkt-svc-haircut', categoryId: 'mkt-cat-beauty', name: 'Haircut at Home', description: 'Professional haircut with wash and styling, for men and women, at your doorstep.', durationMinutes: 45, priceMinor: 3500, displayOrder: 0 },
  { id: 'mkt-svc-facial', categoryId: 'mkt-cat-beauty', name: 'Classic Cleanup & Facial', description: '60-minute facial with exfoliation, extraction, and hydrating mask using dermat-tested products.', durationMinutes: 60, priceMinor: 4900, displayOrder: 1 },
  { id: 'mkt-svc-manicure', categoryId: 'mkt-cat-beauty', name: 'Manicure & Pedicure', description: 'Spa manicure and pedicure with cuticle care, scrub, massage, and polish.', durationMinutes: 90, priceMinor: 5500, displayOrder: 2 },
  { id: 'mkt-svc-leak-repair', categoryId: 'mkt-cat-plumbing', name: 'Leak & Tap Repair', description: 'Fix dripping taps, leaking pipes, and faulty valves. Spare parts billed at cost with your approval.', durationMinutes: 60, priceMinor: 4500, displayOrder: 0 },
  { id: 'mkt-svc-bath-fitting', categoryId: 'mkt-cat-plumbing', name: 'Bathroom Fitting Install', description: 'Professional installation of taps, showers, WCs, and basins with leak testing.', durationMinutes: 150, priceMinor: 11900, displayOrder: 1 },
  { id: 'mkt-svc-switch-repair', categoryId: 'mkt-cat-electrical', name: 'Switch & Socket Repair', description: 'Replace faulty switches, sockets, and MCBs, plus a basic safety check of the room circuit.', durationMinutes: 45, priceMinor: 3900, displayOrder: 0 },
  { id: 'mkt-svc-home-wiring', categoryId: 'mkt-cat-electrical', name: 'Home Safety Inspection', description: 'Full-home electrical safety audit with a written report and fix recommendations.', durationMinutes: 120, priceMinor: 9900, displayOrder: 1 },
  { id: 'mkt-svc-ac-service', categoryId: 'mkt-cat-appliance', name: 'AC Deep Service', description: 'Split/window AC foam-jet cleaning, filter wash, gas-pressure check, and cooling test.', durationMinutes: 75, priceMinor: 4900, displayOrder: 0 },
  { id: 'mkt-svc-washer-repair', categoryId: 'mkt-cat-appliance', name: 'Washer & Dryer Repair', description: 'Diagnosis and repair for washing machines and dryers across major brands.', durationMinutes: 60, priceMinor: 4200, displayOrder: 1 },
  { id: 'mkt-svc-room-paint', categoryId: 'mkt-cat-painting', name: 'Room Repaint (up to 150 sq ft)', description: 'Two coats of premium emulsion with masking, minor crack filling, and post-job cleanup.', durationMinutes: 240, priceMinor: 14900, displayOrder: 0 },
  { id: 'mkt-svc-furniture-paint', categoryId: 'mkt-cat-painting', name: 'Furniture Enamel Polish', description: 'Sanding and enamel repaint for doors, wardrobes, and wood furniture.', durationMinutes: 180, priceMinor: 10900, displayOrder: 1 },
  { id: 'mkt-svc-furniture-assembly', categoryId: 'mkt-cat-handyman', name: 'Furniture Assembly', description: 'Assembly of beds, wardrobes, and desks with wall anchoring where needed.', durationMinutes: 90, priceMinor: 3900, displayOrder: 0 },
  { id: 'mkt-svc-tv-mount', categoryId: 'mkt-cat-handyman', name: 'TV & Wall Mounting', description: 'Secure TV, shelf, and curtain-rod mounting with concealed-cable options.', durationMinutes: 60, priceMinor: 3500, displayOrder: 1 },
  { id: 'mkt-svc-door-repair', categoryId: 'mkt-cat-handyman', name: 'Door & Lock Repair', description: 'Hinge alignment, lock replacement, and sliding-door track fixes.', durationMinutes: 60, priceMinor: 3800, displayOrder: 2 },
] as const;

const MARKETPLACE_PROVIDERS = [
  { id: 'mkt-prov-amara', email: 'amara.okafor@example.com', displayName: 'Amara Okafor', bio: '5 years of residential deep-cleaning experience. I bring my own eco-friendly supplies and never rush a job.', ratingSum: 47, ratingCount: 10 },
  { id: 'mkt-prov-daniel', email: 'daniel.reyes@example.com', displayName: 'Daniel Reyes', bio: 'Licensed plumber specializing in leak detection and bathroom fittings. Upfront pricing, tidy work.', ratingSum: 36, ratingCount: 8 },
  { id: 'mkt-prov-priya', email: 'priya.nair@example.com', displayName: 'Priya Nair', bio: 'Certified beautician offering facials, waxing, and mani-pedi services at home for the past 6 years.', ratingSum: 52, ratingCount: 11 },
  { id: 'mkt-prov-tomas', email: 'tomas.weber@example.com', displayName: 'Tomas Weber', bio: 'Master electrician for repairs, safety inspections, and smart-home upgrades.', ratingSum: 28, ratingCount: 6 },
  { id: 'mkt-prov-lena', email: 'lena.fischer@example.com', displayName: 'Lena Fischer', bio: 'Appliance technician covering AC service and laundry appliances across all major brands.', ratingSum: 31, ratingCount: 7 },
  { id: 'mkt-prov-marco', email: 'marco.silva@example.com', displayName: 'Marco Silva', bio: 'Painter with an eye for finish. Interiors, exteriors, and furniture polish.', ratingSum: 22, ratingCount: 5 },
  { id: 'mkt-prov-sofia', email: 'sofia.conti@example.com', displayName: 'Sofia Conti', bio: 'Handywoman for assembly, mounting, and small repairs. Precise, punctual, and friendly.', ratingSum: 40, ratingCount: 9 },
  { id: 'mkt-prov-kenji', email: 'kenji.tanaka@example.com', displayName: 'Kenji Tanaka', bio: 'All-round home-care specialist: cleaning, assembly, and move-in touch-ups.', ratingSum: 18, ratingCount: 4 },
] as const;

const MARKETPLACE_OFFERINGS: { providerId: string; serviceId: string; priceMinor?: number }[] = [
  { providerId: 'mkt-prov-amara', serviceId: 'mkt-svc-deep-clean' },
  { providerId: 'mkt-prov-amara', serviceId: 'mkt-svc-bathroom-clean' },
  { providerId: 'mkt-prov-amara', serviceId: 'mkt-svc-sofa-clean', priceMinor: 8400 },
  { providerId: 'mkt-prov-kenji', serviceId: 'mkt-svc-deep-clean', priceMinor: 11900 },
  { providerId: 'mkt-prov-kenji', serviceId: 'mkt-svc-furniture-assembly' },
  { providerId: 'mkt-prov-priya', serviceId: 'mkt-svc-haircut' },
  { providerId: 'mkt-prov-priya', serviceId: 'mkt-svc-facial' },
  { providerId: 'mkt-prov-priya', serviceId: 'mkt-svc-manicure' },
  { providerId: 'mkt-prov-daniel', serviceId: 'mkt-svc-leak-repair' },
  { providerId: 'mkt-prov-daniel', serviceId: 'mkt-svc-bath-fitting' },
  { providerId: 'mkt-prov-tomas', serviceId: 'mkt-svc-switch-repair' },
  { providerId: 'mkt-prov-tomas', serviceId: 'mkt-svc-home-wiring' },
  { providerId: 'mkt-prov-lena', serviceId: 'mkt-svc-ac-service' },
  { providerId: 'mkt-prov-lena', serviceId: 'mkt-svc-washer-repair' },
  { providerId: 'mkt-prov-marco', serviceId: 'mkt-svc-room-paint' },
  { providerId: 'mkt-prov-marco', serviceId: 'mkt-svc-furniture-paint' },
  { providerId: 'mkt-prov-sofia', serviceId: 'mkt-svc-furniture-assembly' },
  { providerId: 'mkt-prov-sofia', serviceId: 'mkt-svc-tv-mount' },
  { providerId: 'mkt-prov-sofia', serviceId: 'mkt-svc-door-repair' },
];

const MARKETPLACE_REVIEW_COMMENTS = ['Excellent work, very punctual.', 'Tidy and professional.', 'Would book again without hesitation.'];

async function seedMarketplace(db: ReturnType<typeof getDb>) {
  for (const category of MARKETPLACE_CATEGORIES) {
    await db.insert(serviceCategories).values(category).onConflictDoNothing();
  }
  console.log(`  service_categories: ${MARKETPLACE_CATEGORIES.length}`);

  for (const service of MARKETPLACE_SERVICES) {
    await db
      .insert(services)
      .values({ ...service, currency: 'USD', active: true })
      .onConflictDoNothing();
  }
  console.log(`  services: ${MARKETPLACE_SERVICES.length}`);

  for (const provider of MARKETPLACE_PROVIDERS) {
    const userId = `mkt-user-${provider.id}`;
    await db.insert(users).values({ id: userId, email: provider.email, name: provider.displayName, emailVerified: true }).onConflictDoNothing();
    await db
      .insert(serviceProviders)
      .values({ id: provider.id, userId, displayName: provider.displayName, bio: provider.bio, ratingSum: provider.ratingSum, ratingCount: provider.ratingCount })
      .onConflictDoNothing();
  }
  console.log(`  service_providers: ${MARKETPLACE_PROVIDERS.length}`);

  for (const offering of MARKETPLACE_OFFERINGS) {
    await db
      .insert(providerServices)
      .values({ id: createId(), providerId: offering.providerId, serviceId: offering.serviceId, priceMinor: offering.priceMinor ?? null })
      .onConflictDoNothing();
  }
  console.log(`  provider_services: ${MARKETPLACE_OFFERINGS.length}`);

  // Mon–Sat 09:00–18:00 UTC availability for every demo provider.
  let windowCount = 0;
  for (const provider of MARKETPLACE_PROVIDERS) {
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await db
        .insert(providerAvailability)
        .values({ id: `mkt-avail-${provider.id}-${weekday}`, providerId: provider.id, weekday, startMinutes: 540, endMinutes: 1080, timezone: 'UTC' })
        .onConflictDoNothing();
      windowCount += 1;
    }
  }
  console.log(`  provider_availability: ${windowCount}`);

  // A few completed bookings + reviews so provider profiles show history.
  const demoCustomerId = 'mkt-user-demo-customer';
  await db.insert(users).values({ id: demoCustomerId, email: 'servicehub-customer@example.com', name: 'Demo Customer', emailVerified: true }).onConflictDoNothing();
  await db
    .insert(customerAddresses)
    .values({ id: 'mkt-addr-demo', userId: demoCustomerId, label: 'Home', line1: '14 Market Street', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' })
    .onConflictDoNothing();
  let reviewSeed = 0;
  const showcased: { providerId: string; serviceId: string; rating: number }[] = [
    { providerId: 'mkt-prov-amara', serviceId: 'mkt-svc-deep-clean', rating: 5 },
    { providerId: 'mkt-prov-priya', serviceId: 'mkt-svc-facial', rating: 5 },
    { providerId: 'mkt-prov-daniel', serviceId: 'mkt-svc-leak-repair', rating: 4 },
    { providerId: 'mkt-prov-sofia', serviceId: 'mkt-svc-tv-mount', rating: 5 },
  ];
  for (const item of showcased) {
    const bookingId = `mkt-booking-${item.providerId}`;
    const start = new Date(Date.now() - 7 * 24 * 60 * 60000);
    await db
      .insert(bookings)
      .values({
        id: bookingId,
        customerId: demoCustomerId,
        providerId: item.providerId,
        serviceId: item.serviceId,
        priceMinor: 5000,
        currency: 'USD',
        durationMinutes: 60,
        serviceName: 'Seeded service',
        providerName: 'Seeded provider',
        addressLabel: 'Home',
        addressLine1: '14 Market Street',
        addressCity: 'Austin',
        addressRegion: 'TX',
        addressPostalCode: '78701',
        addressCountry: 'US',
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3600000),
        status: 'completed',
      })
      .onConflictDoNothing();
    await db
      .insert(reviews)
      .values({
        id: `mkt-review-${item.providerId}`,
        bookingId,
        customerId: demoCustomerId,
        providerId: item.providerId,
        rating: item.rating,
        comment: MARKETPLACE_REVIEW_COMMENTS[reviewSeed % MARKETPLACE_REVIEW_COMMENTS.length],
      })
      .onConflictDoNothing();
    reviewSeed += 1;
  }
  console.log(`  bookings/reviews seeded: ${showcased.length}`);
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
