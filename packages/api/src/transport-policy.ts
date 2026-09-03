function hasUnauthorizedError(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasUnauthorizedError(entry, depth + 1));

  const record = value as Record<string, unknown>;
  if (record.code === 'UNAUTHORIZED') return true;
  return ['error', 'json', 'data'].some((key) => hasUnauthorizedError(record[key], depth + 1));
}

export function containsUnauthorizedTRPCError(status: number, body: unknown): boolean {
  return status === 401 || hasUnauthorizedError(body);
}

function hasForbiddenError(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasForbiddenError(entry, depth + 1));

  const record = value as Record<string, unknown>;
  if (record.code === 'FORBIDDEN') return true;
  return ['error', 'shape', 'data', 'json'].some((key) => hasForbiddenError(record[key], depth + 1));
}

/**
 * Detects a permission-denied (FORBIDDEN) client error. Unlike
 * UNAUTHORIZED, this never triggers session termination — retrying with
 * the same credentials cannot succeed, so callers render a permission
 * state instead of a retry state.
 */
export function isForbiddenError(error: unknown): boolean {
  return hasForbiddenError(error);
}

export type UnauthorizedContext = {
  /** Exact Authorization header the failed request carried, or null when absent. */
  authorization: string | null;
};

export function extractRequestAuthorization(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get('authorization');
  if (Array.isArray(headers)) {
    const found = headers.find(([name]) => name.toLowerCase() === 'authorization');
    return found?.[1] ?? null;
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((name) => name.toLowerCase() === 'authorization');
  return key ? record[key] : null;
}

export function createSessionAwareFetch(
  fetchImpl: typeof fetch,
  onUnauthorized: (context: UnauthorizedContext) => void | Promise<void>
): typeof fetch {
  return async (input, init) => {
    const authorization = extractRequestAuthorization(init);
    const response = await fetchImpl(input, init);
    let body: unknown = null;
    if (response.headers.get('content-type')?.includes('application/json')) {
      body = await response.clone().json().catch(() => null);
    }
    if (containsUnauthorizedTRPCError(response.status, body)) await onUnauthorized({ authorization });
    return response;
  };
}
