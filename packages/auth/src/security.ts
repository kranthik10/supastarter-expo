export type PersistedSession = {
  user: { id: string };
  sessionToken: string;
};

export function extractSessionToken(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const token = typeof record.sessionToken === 'string' ? record.sessionToken : record.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function parsePersistedSession(raw: string | null): PersistedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.user !== 'object' || parsed.user === null) return null;
    const user = parsed.user as { id?: unknown };
    if (typeof user.id !== 'string' || user.id.length === 0) return null;
    const sessionToken = extractSessionToken(parsed);
    return sessionToken ? { user: parsed.user as { id: string }, sessionToken } : null;
  } catch {
    return null;
  }
}
