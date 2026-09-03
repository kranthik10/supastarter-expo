import { describe, expect, it } from 'vitest';
import { orgModuleKey } from './query-keys';

describe('orgModuleKey', () => {
  it('builds list keys in module/variant/org order', () => {
    expect(orgModuleKey('notes', 'list', 'org_123')).toEqual(['notes', 'list', 'org_123']);
  });

  it('builds detail keys with the resource id after the org', () => {
    expect(orgModuleKey('notes', 'detail', 'org_123', 'note_456')).toEqual([
      'notes',
      'detail',
      'org_123',
      'note_456',
    ]);
  });

  it('appends stable extra params for filtered views', () => {
    expect(orgModuleKey('notes', 'list', 'org_123', { q: 'hello' })).toEqual([
      'notes',
      'list',
      'org_123',
      { q: 'hello' },
    ]);
  });

  it('keeps different orgs and modules in disjoint key spaces', () => {
    expect(orgModuleKey('notes', 'list', 'org_A')).not.toEqual(
      orgModuleKey('notes', 'list', 'org_B')
    );
    expect(orgModuleKey('notes', 'list', 'org_A')).not.toEqual(
      orgModuleKey('billing', 'subscription', 'org_A')
    );
  });
});
