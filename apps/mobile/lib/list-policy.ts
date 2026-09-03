/**
 * Reusable list conventions (Phase 4.5).
 *
 * Pure client-side helpers for search normalization/matching, stable
 * sorting, and cursor-page flattening. Server remains authoritative for
 * membership, ordering guarantees, and pagination boundaries — these
 * helpers only present data the server already returned.
 */

export const MAX_SEARCH_QUERY_LENGTH = 64;

/** Trim, collapse whitespace runs, and cap length. */
export function normalizeSearchQuery(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_QUERY_LENGTH);
}

/**
 * Case-insensitive substring match across the provided fields.
 * An empty (or whitespace-only) query matches everything so clearing a
 * search box restores the full list.
 */
export function matchesSearchQuery(fields: readonly (string | null | undefined)[], query: string): boolean {
  const needle = normalizeSearchQuery(query).toLowerCase();
  if (needle.length === 0) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}

export type SortDirection = 'asc' | 'desc';

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Stable sort by a derived value. Nullish values sort last in both
 * directions; original order is preserved for equal keys.
 */
export function sortByField<T>(items: readonly T[], getValue: (item: T) => unknown, direction: SortDirection): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((x, y) => {
    const order = direction === 'asc' ? 1 : -1;
    const xv = getValue(x.item);
    const yv = getValue(y.item);
    // Nullish values sort last regardless of direction.
    const xNull = xv === null || xv === undefined;
    const yNull = yv === null || yv === undefined;
    if (xNull && yNull) return x.index - y.index;
    if (xNull) return 1;
    if (yNull) return -1;
    const result = compareValues(xv, yv);
    if (result !== 0) return order * result;
    return x.index - y.index;
  });
  return indexed.map(({ item }) => item);
}

/** Flatten cursor-paginated `{ items }` pages, preserving page order. */
export function flattenPages<T>(pages: readonly { items: readonly T[] }[]): T[] {
  return pages.flatMap((page) => page.items);
}

/** Clamp a requested page size to the server-accepted 1..100 range. */
export function resolvePageLimit(requested: unknown, fallback = 20): number {
  if (typeof requested !== 'number' || !Number.isInteger(requested)) return fallback;
  return Math.min(100, Math.max(1, requested));
}
