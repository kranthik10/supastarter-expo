# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

**supastarter-expo** — a mobile-first SaaS starter kit built with Expo SDK 57, React Native 0.86, Expo Router v6, React 19 and TypeScript. Modeled after supastarter.dev: auth, organizations, billing UI, i18n, theming, landing page, onboarding.

## Commands

- `npm start` — start Metro dev server
- `npx tsc --noEmit` — typecheck (must pass with zero errors)
- `npx expo export` — production bundle verification
- `npm run ios` / `npm run android` / `npm run web` — run on platform

## Architecture

```
app/                    # Expo Router file-based routes
  _layout.tsx           # Root: hydration, appearance listener, i18n init
  (marketing)/          # Public landing page (hero, features, pricing)
  (auth)/               # sign-in, sign-up, forgot-password
  onboarding/           # Multi-step onboarding (profile → org → done)
  (app)/(tabs)/         # Authenticated area: home, team, billing, settings
lib/
  theme.ts              # Design tokens (palette, spacing, typography)
  use-theme.ts          # useTheme() hook — single source of truth for colors
  settings-store.ts     # Zustand: theme mode, locale, persisted to AsyncStorage
  auth-store.ts         # Zustand: local demo auth provider (SecureStore session)
  org-store.ts          # Zustand: organizations, members, roles (persisted)
  billing/              # plans.ts (plan config) + billing-store.ts
  i18n/                 # i18next setup, en.ts + de.ts translations
  storage.ts            # AsyncStorage + SecureStore wrappers
  config.ts             # Central config from EXPO_PUBLIC_* env vars
  api/                  # Typed fetch client + useQuery/useMutation hooks
  ai/                   # Streaming chat adapter (OpenAI-compatible + offline mock)
  analytics/            # Analytics provider pattern (swap PostHog/Amplitude here)
  notifications/        # Push permission/token/register flow
  storage/files.ts      # Presigned-URL file upload flow
ui/index.tsx            # Design system: Text, Screen, Button, Card, Input,
                        # Avatar, Badge, SegmentedControl, ListRow
```

## Category modules

Feature-category boilerplate lives in `lib/<category>/`. Each module is a
self-contained adapter with a narrow interface — screens never talk to SDKs
directly:

| Category | Entry point | Swap-in point |
| --- | --- | --- |
| API | `api/client.ts` | `config.apiUrl` / `setAuthToken` |
| AI chat | `ai/chat.ts` (`streamChat`) | local offline mock; real provider credentials must remain server-side |
| File upload | `storage/files.ts` (`uploadFile`) | backend `POST /files/presign` |
| Analytics | `analytics/index.ts` | `setAnalyticsProvider()` |
| Push | `notifications/push.ts` | install expo-notifications, implement `getPushToken` |

Example usage: the Assistant screen (`app/(app)/assistant.tsx`) consumes
`streamChat` end-to-end with token streaming.

## Conventions

- **State**: Zustand stores in `lib/`, each with a `hydrate()` called once from the root layout. Persist user sessions via `secureStorage`, non-sensitive data via `storage`.
- **Styling**: StyleSheet only. Always get colors from `useTheme()`; never hardcode hex values in screens. Tokens live in `lib/theme.ts`.
- **Translations**: All user-facing strings go through `useTranslation()`. Add keys to both `lib/i18n/en.ts` and `lib/i18n/de.ts` (de is typed as `typeof en`, so missing keys fail typecheck).
- **Routes**: Use route groups. Authenticated routes live under `(app)` which redirects unauthenticated users to `/sign-in`. New sign-ups are routed through `/onboarding`.
- **Billing**: Plan config lives only in `lib/billing/plans.ts`. To add a real provider (Stripe/Polar/Lemon Squeezy), implement checkout there without touching screens.
- **Auth**: The current provider is a local demo provider. Replace `signIn/signUp` in `lib/auth-store.ts` with your backend client (Better Auth, Supabase, etc.) — the rest of the app depends only on this store's interface.

## Rules

1. Run `npx tsc --noEmit` after every change; fix all errors before finishing.
2. Do not add comments unless asked; code should be self-explanatory.
3. Do not introduce new dependencies without checking they support React Native 0.86 / React 19.
4. Keep every user-visible string translated (en + de).
