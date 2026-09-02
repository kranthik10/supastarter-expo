import { z } from 'zod';

export const publicEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().optional().default('https://api.example.com'),
  EXPO_PUBLIC_APP_SCHEME: z.string().optional().default('mobile-saas'),
  EXPO_PUBLIC_APP_SLUG: z.string().optional().default('mobile-saas'),
  EXPO_PUBLIC_APP_NAME: z.string().optional().default('Mobile SaaS'),
  EXPO_PUBLIC_APP_VARIANT: z.enum(['development', 'preview', 'production']).optional().default('production'),
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().optional().default('https://app.posthog.com'),
  EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),
  EXPO_PUBLIC_UPDATES_URL: z.string().url().optional(),
  EXPO_PUBLIC_AI_MODEL: z.string().optional().default('gpt-4o-mini'),
});

export const privateEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).describe('Postgres connection string'),
  BETTER_AUTH_SECRET: z.string().min(32).describe('32+ random bytes'),
  BETTER_AUTH_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  REVENUECAT_SECRET_KEY: z.string().optional(),
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  POSTHOG_SERVER_KEY: z.string().optional(),
  SENTRY_DSN_SERVER: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  ENABLE_DEV_AUTH: z.enum(['true', 'false']).optional(),
  EAS_PROJECT_ID: z.string().optional(),
});

export const serverEnvSchema = publicEnvSchema.merge(privateEnvSchema);

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type PrivateEnv = z.infer<typeof privateEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function getEnv(): Record<string, string | undefined> {
  const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

export function validatePublicEnv(env: Record<string, string | undefined> = getEnv()): PublicEnv {
  return publicEnvSchema.parse(env);
}

export function validatePrivateEnv(env: Record<string, string | undefined> = getEnv()): PrivateEnv {
  return privateEnvSchema.parse(env);
}

export function validateServerEnv(env: Record<string, string | undefined> = getEnv()): ServerEnv {
  return serverEnvSchema.parse(env);
}

export function requirePrivateEnv(env: Record<string, string | undefined> = getEnv()): ServerEnv {
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${msg}`);
  }
  return parsed.data;
}
