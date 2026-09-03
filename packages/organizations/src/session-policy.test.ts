import { describe, expect, it } from 'vitest';
import { reconcileOrganizationSession, selectAccessibleOrganizationId, shouldApplyRefreshResult } from './session-policy';

describe('organization session isolation policy', () => {
  const cached = {
    sessionUserId: 'user-a',
    organizationIds: ['org-a', 'org-shared'],
    activeOrgId: 'org-a',
  };

  it('retains an accessible active organization only for the same user', () => {
    expect(reconcileOrganizationSession(cached, 'user-a')).toEqual({
      sessionUserId: 'user-a',
      organizationIds: ['org-a', 'org-shared'],
      activeOrgId: 'org-a',
      reset: false,
    });
  });

  it('clears every cached organization when a different user begins a session', () => {
    expect(reconcileOrganizationSession(cached, 'user-b')).toEqual({
      sessionUserId: 'user-b',
      organizationIds: [],
      activeOrgId: null,
      reset: true,
    });
  });

  it('falls back after membership removal without retaining an inaccessible active organization', () => {
    expect(selectAccessibleOrganizationId('org-a', ['org-b', 'org-c'])).toBe('org-b');
    expect(selectAccessibleOrganizationId('org-a', [])).toBeNull();
    expect(selectAccessibleOrganizationId('org-b', ['org-b', 'org-c'])).toBe('org-b');
  });

  it('drops stale refresh results when the session identity changed mid-request', () => {
    expect(shouldApplyRefreshResult('user-a', 'user-a')).toBe(true);
    expect(shouldApplyRefreshResult('user-a', 'user-b')).toBe(false);
    expect(shouldApplyRefreshResult('user-a', null)).toBe(false);
    expect(shouldApplyRefreshResult(null, null)).toBe(false);
  });
});
