import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@repo/database';

export function getAuth() {
  const db = getDb();
  return betterAuth({
    database: drizzleAdapter(db as unknown as Record<string, unknown>, { provider: 'pg' }),
    secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-at-least-32-chars-long!!',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    emailAndPassword: { enabled: true },
    session: { expiresIn: 60 * 60 * 24 * 7 },
  });
}

export type Auth = ReturnType<typeof getAuth>;
