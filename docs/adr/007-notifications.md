# ADR-007 — Notification Architecture

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Push is first-class on mobile (§15) and must handle all app states + deep links.
- **Decision:** `expo-notifications` + Expo Push Service → APNs/FCM. Device + `push_tokens` tables store provider `expo` tokens; server sends via Expo Push API; receipt/bounce webhook updates token validity. Preferences in `users.notificationPreferences` JSONB. Deep link payload in `notifications.data.url`.
- **Alternatives:** Firebase-only, OneSignal.
- **Consequences:** Single token path for iOS/Android; `requestPermissions → getPushToken → registerPushToken` flow (already stubbed in `lib/notifications/push.ts`); EAS credentials manage APNs/FCM.
