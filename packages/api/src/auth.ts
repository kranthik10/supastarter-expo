import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb, schema } from '@repo/database';
import { parseAllowedOrigins } from './http-security';

type AuthEnvironment = Record<string, string | undefined>;

export type AuthConfig = { secret: string; baseURL: string; trustedOrigins: string[] };

export function getAuthConfig(env: AuthEnvironment = process.env): AuthConfig {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  return {
    secret,
    baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    trustedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
  };
}

export function getAuth() {
  const authConfig = getAuthConfig();
  const db = getDb();
  return betterAuth({
    database: drizzleAdapter(db as unknown as Record<string, unknown>, { provider: 'pg', schema, usePlural: true }),
    secret: authConfig.secret,
    baseURL: authConfig.baseURL,
    trustedOrigins: authConfig.trustedOrigins,
    emailAndPassword: { enabled: true },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof getAuth>;
