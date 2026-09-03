import { describe, expect, it } from 'vitest';
import { resolveQueryState } from './query-state';

describe('resolveQueryState', () => {
  it('resolves loading while pending regardless of other flags', () => {
    expect(resolveQueryState({ isPending: true, isError: true, isEmpty: true })).toBe('loading');
  });

  it('resolves permission for forbidden errors instead of retryable error', () => {
    expect(
      resolveQueryState({ isPending: false, isError: true, error: { data: { code: 'FORBIDDEN' } } })
    ).toBe('permission');
  });

  it('resolves retryable error for non-forbidden failures', () => {
    expect(
      resolveQueryState({ isPending: false, isError: true, error: { data: { code: 'NOT_FOUND' } } })
    ).toBe('error');
    expect(resolveQueryState({ isPending: false, isError: true, error: new Error('boom') })).toBe(
      'error'
    );
  });

  it('resolves empty only when loaded without error and no content', () => {
    expect(resolveQueryState({ isPending: false, isError: false, isEmpty: true })).toBe('empty');
  });

  it('resolves content when loaded with content', () => {
    expect(resolveQueryState({ isPending: false, isError: false, isEmpty: false })).toBe(
      'content'
    );
  });
});
