# ADR-005 — Authentication (Better Auth)

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Starter must own sessions, support email/password + OAuth + Apple, and remain provider-agnostic (§2.4).
- **Decision:** Better Auth as primary (database-owned sessions, Postgres-native, `expo-auth-session` compatible). Expose an `AuthClient` interface (`signIn`, `signUp`, `signInWithGoogle/Apple`, `getSession`) so Clerk/Supabase are adapter swaps, not rewrites. Expo OAuth requires a development build due to custom scheme redirects.
- **Alternatives:** Clerk (vendor lock), Supabase Auth (tied to Supabase), custom.
- **Consequences:** Sessions in `sessions` table, SecureStore holds only the token; flows V1: email/password, verification, forgot/reset, Google, Apple; V2: magic links, passkeys, 2FA, biometrics.
