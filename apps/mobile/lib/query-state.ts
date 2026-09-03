export type QueryState = 'loading' | 'permission' | 'error' | 'empty' | 'content';

function hasForbiddenCode(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasForbiddenCode(entry, depth + 1));

  const record = value as Record<string, unknown>;
  if (record.code === 'FORBIDDEN') return true;
  return ['error', 'shape', 'data', 'json'].some((key) =>
    hasForbiddenCode(record[key], depth + 1)
  );
}

/**
 * Resolves a TanStack Query result to one finite UI state.
 * Permission-denied (FORBIDDEN) never maps to retryable error:
 * retrying with the same credentials cannot succeed.
 */
export function resolveQueryState(input: {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
}): QueryState {
  if (input.isPending) return 'loading';
  if (input.isError) return hasForbiddenCode(input.error) ? 'permission' : 'error';
  if (input.isEmpty) return 'empty';
  return 'content';
}
