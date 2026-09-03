import { describe, expect, it } from 'vitest';
import {
  flattenPages,
  matchesSearchQuery,
  normalizeSearchQuery,
  resolvePageLimit,
  sortByField,
} from './list-policy';

describe('normalizeSearchQuery', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSearchQuery('  jane  ')).toBe('jane');
  });

  it('collapses inner whitespace runs', () => {
    expect(normalizeSearchQuery('jane   doe')).toBe('jane doe');
  });

  it('caps length so overlong input cannot reach a query filter', () => {
    expect(normalizeSearchQuery('a'.repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe('matchesSearchQuery', () => {
  it('matches case-insensitively across any provided field', () => {
    expect(matchesSearchQuery(['Jane Doe', 'jane@acme.com'], 'JANE')).toBe(true);
  });

  it('ignores nullish fields', () => {
    expect(matchesSearchQuery([null, undefined, 'acme'], 'acme')).toBe(true);
  });

  it('returns false when no field contains the query', () => {
    expect(matchesSearchQuery(['Jane', 'jane@acme.com'], 'bob')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesSearchQuery(['Jane'], '   ')).toBe(true);
  });
});

describe('sortByField', () => {
  it('sorts strings ascending', () => {
    const items = [{ n: 'c' }, { n: 'a' }, { n: 'b' }];
    expect(sortByField(items, (i) => i.n, 'asc').map((i) => i.n)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending', () => {
    const items = [{ n: 'a' }, { n: 'c' }, { n: 'b' }];
    expect(sortByField(items, (i) => i.n, 'desc').map((i) => i.n)).toEqual(['c', 'b', 'a']);
  });

  it('keeps original order for equal keys', () => {
    const items = [{ n: 'x', id: 1 }, { n: 'x', id: 2 }, { n: 'a', id: 3 }];
    expect(sortByField(items, (i) => i.n, 'asc').map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it('sorts nullish values last in both directions', () => {
    const items = [{ n: null as string | null }, { n: 'b' }, { n: 'a' }];
    expect(sortByField(items, (i) => i.n, 'asc').map((i) => i.n)).toEqual(['a', 'b', null]);
    expect(sortByField(items, (i) => i.n, 'desc').map((i) => i.n)).toEqual(['b', 'a', null]);
  });

  it('sorts dates chronologically', () => {
    const items = [{ d: new Date('2026-03-01') }, { d: new Date('2026-01-01') }];
    expect(sortByField(items, (i) => i.d, 'asc')[0]?.d.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not mutate the input', () => {
    const items = [{ n: 'b' }, { n: 'a' }];
    sortByField(items, (i) => i.n, 'asc');
    expect(items.map((i) => i.n)).toEqual(['b', 'a']);
  });
});

describe('flattenPages', () => {
  it('concatenates page items in order', () => {
    expect(flattenPages([{ items: [1, 2] }, { items: [3] }, { items: [] }])).toEqual([1, 2, 3]);
  });

  it('returns an empty array for no pages', () => {
    expect(flattenPages([])).toEqual([]);
  });
});

describe('resolvePageLimit', () => {
  it('clamps to the 1..100 range', () => {
    expect(resolvePageLimit(0)).toBe(1);
    expect(resolvePageLimit(500)).toBe(100);
    expect(resolvePageLimit(50)).toBe(50);
  });

  it('falls back for non-integer input', () => {
    expect(resolvePageLimit(Number.NaN)).toBe(20);
    expect(resolvePageLimit('30')).toBe(20);
    expect(resolvePageLimit(undefined, 10)).toBe(10);
  });
});
