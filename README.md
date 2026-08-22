# supastarter-expo ⚡

A production-shaped **mobile SaaS starter kit** for [Expo](https://expo.dev) — modeled after [supastarter.dev](https://supastarter.dev). Auth, organizations, billing UI, i18n (EN/DE), dark mode, landing page and onboarding — all wired together and ready to customize.

## Stack

- Expo SDK 57 · React Native 0.86 · React 19 · TypeScript (strict)
- Expo Router v6 (file-based routing, typed routes)
- Zustand state with persisted sessions (SecureStore + AsyncStorage)
- i18next translations (English / German)
- Lucide icons, custom StyleSheet-based design system (zero CSS-runtime risk)

## Get started

```bash
npm install
npx expo start
```

Then press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go.

## What's inside

| Feature | Where |
| --- | --- |
| Landing page (hero, features, pricing) | `app/(marketing)/` |
| Sign in / sign up / forgot password | `app/(auth)/` |
| Multi-step onboarding | `app/onboarding/` |
| Dashboard | `app/(app)/(tabs)/index.tsx` |
| Organizations & members (roles, invites) | `lib/org-store.ts` |
| Billing plans & upgrade flow | `lib/billing/` |
| Settings (theme, language, account) | `app/(app)/(tabs)/settings.tsx` |
| Design system | `ui/index.tsx` |
| Typed API client + hooks | `lib/api/` |
| AI chat (streaming + offline mock) | `lib/ai/` — demo: Assistant screen |
| File upload (presigned flow) | `lib/storage/files.ts` |
| Analytics provider pattern | `lib/analytics/` |
| Push notifications flow | `lib/notifications/push.ts` |

## Demo mode

Auth runs on a local demo provider — any email + password (min 6 chars) works, sessions persist securely on-device. Swap in your real backend by editing only `lib/auth-store.ts`.

## Going to production

- **Payments**: implement checkout in `lib/billing/plans.ts` with Stripe/Polar/Lemon Squeezy.
- **Real auth**: replace the provider in `lib/auth-store.ts` (Better Auth, Supabase, …).
- **Deploy**: `eas build` for app stores; web export works out of the box.

## Verification

```bash
npx tsc --noEmit     # zero type errors
npx expo export      # bundles cleanly for ios/web/android
```
