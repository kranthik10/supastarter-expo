export type ClientSessionLifecycleDependencies = {
  clearQueryCache: () => void;
  beginOrganizationSession: (userId: string) => Promise<void>;
  clearOrganizationSession: () => Promise<void>;
  clearAuthSession: () => Promise<void>;
  clearPendingLink?: () => Promise<void>;
};

export async function reconcileClientSession(
  previousUserId: string | null | undefined,
  nextUserId: string | null,
  dependencies: ClientSessionLifecycleDependencies
): Promise<string | null> {
  if (previousUserId !== undefined && previousUserId === nextUserId) return nextUserId;

  dependencies.clearQueryCache();
  if (nextUserId) await dependencies.beginOrganizationSession(nextUserId);
  else await dependencies.clearOrganizationSession();
  return nextUserId;
}

export async function terminateClientSession(
  dependencies: ClientSessionLifecycleDependencies
): Promise<void> {
  dependencies.clearQueryCache();
  // A stored pending deep link belongs to the ending auth flow; it must not
  // leak into the next user's session. A clearing failure must never skip
  // organization/auth clearing, so it is contained here.
  try {
    await dependencies.clearPendingLink?.();
  } catch {}
  await dependencies.clearOrganizationSession();
  await dependencies.clearAuthSession();
}
