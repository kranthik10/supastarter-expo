import { describe, expect, it, vi } from 'vitest';
import { reconcileClientSession, terminateClientSession } from './session-lifecycle';

function dependencies() {
  return {
    clearQueryCache: vi.fn(),
    beginOrganizationSession: vi.fn(async (_userId: string) => undefined),
    clearOrganizationSession: vi.fn(async () => undefined),
    clearAuthSession: vi.fn(async () => undefined),
  };
}

describe('client session lifecycle', () => {
  it('clears stale anonymous state on the first authenticated-state reconciliation', async () => {
    const deps = dependencies();

    await expect(reconcileClientSession(undefined, null, deps)).resolves.toBeNull();

    expect(deps.clearQueryCache).toHaveBeenCalledOnce();
    expect(deps.clearOrganizationSession).toHaveBeenCalledOnce();
    expect(deps.beginOrganizationSession).not.toHaveBeenCalled();
  });

  it('does nothing when the authenticated user is unchanged', async () => {
    const deps = dependencies();

    await expect(reconcileClientSession('user-a', 'user-a', deps)).resolves.toBe('user-a');

    expect(deps.clearQueryCache).not.toHaveBeenCalled();
    expect(deps.beginOrganizationSession).not.toHaveBeenCalled();
    expect(deps.clearOrganizationSession).not.toHaveBeenCalled();
  });

  it('clears query data and scopes organizations when the authenticated user changes', async () => {
    const deps = dependencies();

    await expect(reconcileClientSession('user-a', 'user-b', deps)).resolves.toBe('user-b');

    expect(deps.clearQueryCache).toHaveBeenCalledOnce();
    expect(deps.beginOrganizationSession).toHaveBeenCalledWith('user-b');
    expect(deps.clearOrganizationSession).not.toHaveBeenCalled();
  });

  it('clears auth, query, and organization state after an unauthorized response', async () => {
    const deps = dependencies();

    await terminateClientSession(deps);

    expect(deps.clearAuthSession).toHaveBeenCalledOnce();
    expect(deps.clearQueryCache).toHaveBeenCalledOnce();
    expect(deps.clearOrganizationSession).toHaveBeenCalledOnce();
  });
});
