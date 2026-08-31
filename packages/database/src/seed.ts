import { createId } from '@paralleldrive/cuid2';
import { getDb } from './index';
import { roles, permissions, rolePermissions, plans, users, organizations, organizationMembers } from './schema';

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
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
