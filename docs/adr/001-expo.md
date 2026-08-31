# ADR-001 — Why Expo

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Mobile SaaS needs iOS + Android from one codebase, native modules (push, secure storage, biometrics), and store deployment.
- **Decision:** Expo SDK 57 (managed workflow) with Expo Router v6. Use development builds for any native module beyond Expo Go.
- **Alternatives:** Bare React Native, Flutter, native Swift/Kotlin.
- **Consequences:** EAS Build/Update/Submit become the standard path; Expo Go remains for UI-only iteration; custom native code requires `npx expo prebuild` but stays within the Expo ecosystem.
