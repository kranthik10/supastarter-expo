# Phase 5.5 — Module Registration + Navigation

Baseline: `7d6ef1c`. Status: inspection verdict (no registry built).

## Verdict: checklist over registry

A client module registry (`key/label/route/icon/permission/screen`)
is NOT justified at this module count (one reference module). Evidence
against: tab entries need component icon refs, the nav policy needs
string patterns with per-route query rules, i18n needs typed blocks,
analytics needs ScreenName literals — a registry would either
duplicate these in weaker typings or grow into the mega-config object
rejected in 5.4. Server authorization must never consult a client
registry; it would be dead weight with authority pretensions.

## The actual touchpoint checklist (new module = these 5 edits)

```text
1. (app)/(tabs)/_layout.tsx      Tabs.Screen (title + lucide icon)
2. navigation-policy.ts          statics + bounded :segment (tests first)
3. apps/mobile/lib/i18n/en+de    one <module> block (parity typed)
4. analytics policy ScreenName   logical screen name + path mapping
5. .maestro/flows/<module>.yaml  authored flow on verified labels
```

Deep-link parsing (`linking-policy.ts`) inherits the allowlist with
no per-module code. Revisit a registry only when ≥3 tab modules exist
and the checklist demonstrably drifts.
