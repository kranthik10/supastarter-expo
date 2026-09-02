export type DashboardRole = 'owner' | 'admin' | 'member';
export type DashboardSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}

export function formatUsage(usedBytes: number, limitBytes: number | null): string {
  const used = formatBytes(usedBytes);
  return limitBytes === null ? `${used} used · Unlimited` : `${used} / ${formatBytes(limitBytes)}`;
}

export function formatCount(count: number, limit: number | null): string {
  return limit === null ? `${count} · Unlimited` : `${count} / ${limit}`;
}

export function subscriptionTone(status: DashboardSubscriptionStatus | null, graceActive: boolean): string {
  if (!status) return 'free';
  if (status === 'past_due' && graceActive) return 'past_due_grace';
  return status;
}

export function dashboardActionsForRole(role: DashboardRole): { canInvite: boolean; canManageBilling: boolean } {
  return { canInvite: role === 'owner' || role === 'admin', canManageBilling: role === 'owner' || role === 'admin' };
}
