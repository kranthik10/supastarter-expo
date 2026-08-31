const gEnv = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export const config = {
  apiUrl: gEnv.EXPO_PUBLIC_API_URL ?? 'https://api.example.com',
  appScheme: gEnv.EXPO_PUBLIC_APP_SCHEME ?? 'mobile-saas',
  appSlug: gEnv.EXPO_PUBLIC_APP_SLUG ?? 'mobile-saas',
  appName: gEnv.EXPO_PUBLIC_APP_NAME ?? 'Mobile SaaS',
  appVariant: (gEnv.EXPO_PUBLIC_APP_VARIANT as 'development' | 'preview' | 'production') ?? 'production',
  posthogKey: gEnv.EXPO_PUBLIC_POSTHOG_KEY,
  posthogHost: gEnv.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
  sentryDsn: gEnv.EXPO_PUBLIC_SENTRY_DSN,
  aiModel: gEnv.EXPO_PUBLIC_AI_MODEL ?? 'gpt-4o-mini',
} as const;

export type AppConfig = typeof config;
