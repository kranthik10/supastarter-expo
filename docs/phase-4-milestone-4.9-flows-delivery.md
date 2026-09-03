# Phase 4 — Milestone 4.9 Authored Flows Delivery

Baseline: `7d41d16` (4.8 navigation). Scope: update authored Maestro
flows to final labels/routes; record component/integration coverage.
Maestro EXECUTION remains deferred (not permitted in this phase) —
flows are authored and label-verified against source, not run.

## IMPLEMENTED

Authored flows (`.maestro/flows/`, appId + dev scheme unchanged and
verified against `app.config.ts` variants):

- `appLaunch.yaml`: was asserting `Sign in` + `Welcome`, neither of
  which renders on marketing. Now asserts the real entry CTAs
  `Start for free` + `Learn more`.
- `auth.yaml`: was tapping a nonexistent `Sign in` entry CTA, a
  nonexistent `Continue` submit, and asserting a nonexistent
  `Protected route` string (zero source matches). Now: `Learn more`
  → `Welcome back!` → Email/Password input → `Sign in` submit →
  `Home` tab → Settings → `Sign out` → back to `Welcome back!`
  (proves sign-out lands on the public sign-in screen).
- `protected.yaml`: was tapping a nonexistent `Home` element while
  signed out. Now asserts cold launch lands on public entry
  (`Start for free`) and the `Settings` tab is absent.
- `deepLink.yaml`: was asserting `Invite` (actual heading is
  `Organization invitation`) and tapping `Continue` (actual button is
  `Sign in`). Now matches the invite screen; pending-link → sign-in
  continuity (`Welcome back!`) preserved.
- `onboarding.yaml`: was tapping `Create Organization` / `Create`
  (the flow is a stepped wizard, not that screen). Now follows the
  real wizard: `Start for free` → `Create your account` → name/email/
  password → `Get started` → `Welcome aboard!` → `Continue` →
  `Your profile` → `Continue` → `Create your organization` →
  `Continue` → `You're all set!` → `Go to dashboard` → `Home`.
- `notes.yaml` (new): reference CRUD flow consuming 4.6–4.8 routes —
  `Notes` tab → `Search notes` → `New note` → Title/Body →
  `Create note` → detail shows title → `Delete note` ×2 (row action +
  confirm) → back to `Notes`.

Every asserted/tapped string was verified against
`apps/mobile/lib/i18n/en.ts` or the rendering screen source in this
milestone. No app code changed.

## VERIFIED

- Label audit: all flow strings source-verified (see above).
- Component/integration coverage (existing suites, this head):
  transport-policy, query-state, list-policy, subscription-view,
  notes router (6), rbac (25), analytics policy, session-lifecycle,
  navigation-policy + linking (9) — full `pnpm test` counts in
  commit trailer.
- Maestro execution: DEFERRED (not run — no device/EAS in Phase 4).

## DEFERRED

- Maestro execution on a real device/build (requires Phase 5 setup).
- Migrating remaining screens to 4.7 shared states (prior doc).

## BLOCKED

- None new. Prior gates (reset-email provider, EAS) unchanged.
