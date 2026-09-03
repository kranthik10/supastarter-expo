export function selectAccessibleOrganizationId(current: string | null, accessibleIds: string[]): string | null {
  if (current && accessibleIds.includes(current)) return current;
  return accessibleIds[0] ?? null;
}

/**
 * Guards against stale organization refreshes: a refresh started under one
 * session must not install its results after the session changed or ended.
 */
export function shouldApplyRefreshResult(
  startedSessionUserId: string | null,
  currentSessionUserId: string | null
): boolean {
  return startedSessionUserId !== null && startedSessionUserId === currentSessionUserId;
}

export function reconcileOrganizationSession(
  cached: { sessionUserId: string | null; organizationIds: string[]; activeOrgId: string | null },
  nextUserId: string
): {
  sessionUserId: string;
  organizationIds: string[];
  activeOrgId: string | null;
  reset: boolean;
} {
  if (cached.sessionUserId !== nextUserId) {
    return { sessionUserId: nextUserId, organizationIds: [], activeOrgId: null, reset: true };
  }

  return {
    sessionUserId: nextUserId,
    organizationIds: cached.organizationIds,
    activeOrgId: selectAccessibleOrganizationId(cached.activeOrgId, cached.organizationIds),
    reset: false,
  };
}
