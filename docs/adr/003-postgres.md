# ADR-003 — Why PostgreSQL

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** SaaS needs relational org membership, subscriptions, and audit trails with strong consistency.
- **Decision:** PostgreSQL 16 (Neon/Supabase/Railway compatible). Extensions: `pgcrypto`, `citext` (optional).
- **Alternatives:** SQLite, MySQL, MongoDB.
- **Consequences:** JSONB for notification payloads, robust RLS patterns, `drizzle-orm` native support, widely available managed hosting.
