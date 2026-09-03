/**
 * User-scoped TanStack Query key factory for the marketplace.
 *
 * Shape: ['mkt', variant, userId, ...params]. Marketplace identity keys
 * off users.id (customer/provider), deliberately distinct from the SaaS
 * organization scope — so the user id takes the scope position that
 * organizationId takes in orgModuleKey. A different signed-in user is a
 * different key space; stale data from another user can never be reused.
 * Authenticated-public catalog reads use the shared 'catalog' scope.
 */
export function mktKey(variant: string, scope: string, ...params: unknown[]): unknown[] {
  return ['mkt', variant, scope, ...params];
}

export const MKT_CATALOG_SCOPE = 'catalog';
