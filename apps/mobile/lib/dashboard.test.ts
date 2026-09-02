import { describe, expect, it } from 'vitest';
import {
  dashboardActionsForRole,
  formatBytes,
  formatCount,
  formatUsage,
  subscriptionTone,
} from './dashboard';

describe('dashboard presentation helpers', () => {
  it('formats confirmed storage usage and unlimited limits', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatUsage(1024, 5 * 1024 * 1024 * 1024)).toBe('1 KB / 5 GB');
    expect(formatUsage(1024, null)).toBe('1 KB used · Unlimited');
    expect(formatCount(0, 2)).toBe('0 / 2');
    expect(formatCount(3, null)).toBe('3 · Unlimited');
  });

  it('preserves subscription state distinctions', () => {
    expect(subscriptionTone(null, false)).toBe('free');
    expect(subscriptionTone('trialing', true)).toBe('trialing');
    expect(subscriptionTone('past_due', true)).toBe('past_due_grace');
    expect(subscriptionTone('past_due', false)).toBe('past_due');
    expect(subscriptionTone('canceled', false)).toBe('canceled');
  });

  it('derives only UX actions from the existing role union', () => {
    expect(dashboardActionsForRole('owner')).toEqual({ canInvite: true, canManageBilling: true });
    expect(dashboardActionsForRole('admin')).toEqual({ canInvite: true, canManageBilling: true });
    expect(dashboardActionsForRole('member')).toEqual({ canInvite: false, canManageBilling: false });
  });
});
