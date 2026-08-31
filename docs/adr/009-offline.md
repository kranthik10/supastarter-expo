# ADR-009 — Offline Strategy

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Mobile apps face intermittent connectivity but full offline sync is expensive and error-prone (§17).
- **Decision:** Progressive. V1: TanStack Query persistent cache (AsyncStorage), `NetInfo` offline banner, retry with exponential backoff, no mutation queue — mutations fail visibly. V2: mutation queue + sync/conflict handling (deferred, not in MVP).
- **Alternatives:** Offline-first sync from day one (WatermelonDB + sync engine).
- **Consequences:** MVP ships fast with graceful degradation; no complex conflict resolution to maintain; V2 can adopt WatermelonDB/PowerSync without breaking V1 API.
