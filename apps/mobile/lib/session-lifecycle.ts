export type ClientSessionLifecycleDependencies = {
  clearQueryCache: () => void;
  beginOrganizationSession: (userId: string) => Promise<void>;
  clearOrganizationSession: () => Promise<void>;
  clearAuthSession: () => Promise<void>;
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
  await dependencies.clearOrganizationSession();
  await dependencies.clearAuthSession();
}
