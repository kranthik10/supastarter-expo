/**
 * Canonical org-scoped TanStack Query key factory.
 *
 * Shape: [module, variant, organizationId, ...params].
 * The organizationId in third position is what makes org switching
 * cache-safe by construction: a new active org is a new key space,
 * so stale data from another org can never be reused.
 * User-scoped (non-org) queries keep their own ad-hoc keys.
 */
export function orgModuleKey(
  module: string,
  variant: string,
  organizationId: string,
  ...params: unknown[]
): unknown[] {
  return [module, variant, organizationId, ...params];
}
