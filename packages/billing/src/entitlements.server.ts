// Server-only helpers — import only from Node (packages/api), never from apps/mobile.
// Keeps @repo/database out of the mobile bundle.
import { entitlements as entitlementsTable, subscriptions as subscriptionsTable } from '@repo/database';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import type { Database } from '@repo/database';
import {
  ALL_FEATURES,
  PLAN_ENTITLEMENTS,
  resolveEntitlement,
  type Feature,
  type PlanId,
  type SubscriptionRow,
} from './entitlements';

export type EntitlementRow = typeof entitlementsTable.$inferSelect;
type EntitlementsDatabase = Pick<Database, 'select' | 'insert'>;
export { ALL_FEATURES, PLAN_ENTITLEMENTS } from './entitlements';
export type { Feature, PlanId, SubscriptionRow } from './entitlements';

export async function getEntitlement(
  db: EntitlementsDatabase,
  organizationId: string,
  feature: Feature,
  opts?: { planId?: PlanId; subscription?: SubscriptionRow | null; now?: Date }
): Promise<{ feature: Feature; enabled: boolean; limit: number | null; planId: PlanId } | null> {
  if (!ALL_FEATURES.includes(feature)) return null;
  const planId: PlanId = opts?.planId ?? (await resolvePlanIdForOrg(db, organizationId)) ?? 'free';
  const subscription = opts?.subscription ?? (await getSubscriptionRow(db, organizationId));
  const rows = await db
    .select()
    .from(entitlementsTable)
    .where(and(eq(entitlementsTable.organizationId, organizationId), eq(entitlementsTable.feature, feature)))
    .limit(1);
  const row = rows[0] ?? null;
  return resolveEntitlement({ feature, planId, row: row ? { limit: row.limit, enabled: row.enabled } : null, subscription, now: opts?.now });
}

export async function getFeatureLimit(db: EntitlementsDatabase, organizationId: string, feature: Feature): Promise<number | null | undefined> {
  const e = await getEntitlement(db, organizationId, feature);
  return e?.limit ?? undefined;
}

export async function isFeatureEnabled(db: EntitlementsDatabase, organizationId: string, feature: Feature): Promise<boolean> {
  const e = await getEntitlement(db, organizationId, feature);
  return e?.enabled ?? false;
}

export async function canUseFeature(db: EntitlementsDatabase, organizationId: string, feature: Feature, usage: number): Promise<boolean> {
  const e = await getEntitlement(db, organizationId, feature);
  if (!e) return false;
  if (!e.enabled) return false;
  if (e.limit === null) return true;
  return usage < e.limit;
}

export async function listEntitlements(
  db: EntitlementsDatabase,
  organizationId: string
): Promise<{ feature: Feature; enabled: boolean; limit: number | null; planId: PlanId }[]> {
  const planId = (await resolvePlanIdForOrg(db, organizationId)) ?? 'free';
  const sub = await getSubscriptionRow(db, organizationId);
  const rows = await db.select().from(entitlementsTable).where(eq(entitlementsTable.organizationId, organizationId));
  const byFeature = new Map<string, { limit: number | null; enabled: boolean }>();
  for (const r of rows) byFeature.set(r.feature, { limit: r.limit, enabled: r.enabled });
  return ALL_FEATURES.map((f) =>
    resolveEntitlement({ feature: f, planId, row: byFeature.get(f) ?? null, subscription: sub })
  );
}

async function resolvePlanIdForOrg(db: EntitlementsDatabase, organizationId: string): Promise<PlanId | null> {
  const subs = await db
    .select({ planId: subscriptionsTable.planId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, organizationId))
    .limit(1);
  const pid = subs[0]?.planId as PlanId | undefined;
  if (pid === 'free' || pid === 'pro' || pid === 'enterprise') return pid;
  return null;
}

async function getSubscriptionRow(db: EntitlementsDatabase, organizationId: string): Promise<SubscriptionRow | null> {
  const rows = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, organizationId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    status: r.status as SubscriptionRow['status'],
    trialEndsAt: r.trialEndsAt,
    graceEndsAt: r.graceEndsAt,
    currentPeriodEnd: r.currentPeriodEnd,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    planId: r.planId,
  };
}

export async function syncEntitlementsForPlan(db: EntitlementsDatabase, organizationId: string, planId: PlanId): Promise<void> {
  const defaults = PLAN_ENTITLEMENTS[planId] ?? PLAN_ENTITLEMENTS.free;
  for (const d of defaults) {
    await db
      .insert(entitlementsTable)
      .values({
        id: createId(),
        organizationId,
        feature: d.feature,
        limit: d.limit,
        enabled: d.enabled,
      })
      .onConflictDoUpdate({
        target: [entitlementsTable.organizationId, entitlementsTable.feature],
        set: { limit: d.limit, enabled: d.enabled, updatedAt: new Date() },
      });
  }
}

export async function initEntitlementsForOrg(db: EntitlementsDatabase, organizationId: string, planId: PlanId = 'free'): Promise<void> {
  return syncEntitlementsForPlan(db, organizationId, planId);
}
