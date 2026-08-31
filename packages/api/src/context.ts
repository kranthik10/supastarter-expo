import type { Context as HonoContext } from 'hono';
import { getDb } from '@repo/database';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@repo/database';

export type ApiContext = {
  db: ReturnType<typeof getDb>;
  user: (typeof users.$inferSelect) | null;
  sessionId: string | null;
  headers: Record<string, string>;
};

export async function createContext(c: HonoContext): Promise<ApiContext> {
  const db = getDb();
  const auth = c.req.header('authorization') ?? c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  let user: ApiContext['user'] = null;
  let sessionId: string | null = null;

  // Dev mock: allow Authorization: Bearer dev-token to return a fake user without DB
  if (token === 'dev-token') {
    user = { id: 'u_dev', email: 'dev@example.com', name: 'Dev User', emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() } as unknown as ApiContext['user'];
    sessionId = 'sess_dev';
    return { db, user, sessionId, headers: Object.fromEntries(c.req.raw.headers.entries()) };
  }

  if (token) {
    try {
      const sess = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1)
        .then((r) => r[0]);
      if (sess && new Date(sess.expiresAt as unknown as string) > new Date()) {
        const u = await db
          .select()
          .from(users)
          .where(eq(users.id, sess.userId))
          .limit(1)
          .then((r) => r[0]);
        if (u) {
          user = u as unknown as ApiContext['user'];
          sessionId = sess.id;
        }
      }
    } catch {
      // DB unavailable - treat as unauthenticated, do not throw
    }
  }

  return { db, user, sessionId, headers: Object.fromEntries(c.req.raw.headers.entries()) };
}
