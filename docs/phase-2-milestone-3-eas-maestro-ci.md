# Phase 2 — Milestone 3: EAS Development Build + Maestro + CI

**Checkpoint:** `0dae428 feat: complete phase 2 organization and rbac`
**Date:** 2026-09-01
**Status:** BLOCKED — infrastructure prerequisites missing (see evidence below)

---

## 1. EAS Development Build

### Configuration Inspected

**`apps/mobile/eas.json`:**
- Profiles: `development` (developmentClient: true, distribution: internal, channel: development, iOS resourceClass m-medium), `preview` (distribution internal), `production` (autoIncrement)
- Env overrides per profile present (`EXPO_PUBLIC_APP_VARIANT`, `EXPO_PUBLIC_APP_SCHEME`)
- No `cli.appVersionSource` issues; config is syntactically valid.

**`apps/mobile/app.config.ts`:**
- Dynamic variant config: development → `mobile-saas-dev` / `com.mobilesaas.app.dev`, preview → `.preview`, production → base
- `runtimeVersion: { policy: 'appVersion' }` set
- `extra.eas.projectId` reads from `EAS_PROJECT_ID` with fallback `00000000-0000-0000-0000-000000000000`
- Plugins: `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-localization` — all compatible with SDK 57
- Validated via `npx expo config --type public` — no errors (loads `.env.development` correctly)

**Result:** Configuration is structurally sound for EAS.

### Build Attempt

```bash
$ cd apps/mobile && eas build --profile development --platform ios --local --non-interactive

★ eas-cli@23.2.0 is now available.
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable
    Error: build command failed.
```

Also attempted:
```bash
$ eas whoami
Not logged in

$ eas project:info
An Expo user account is required to proceed.
```

### Verdict

```
EAS development build: BLOCKED
Build ID: — (no build initiated)
Platform: iOS (intended), Android also defined in eas.json but not attempted due to same auth blocker
```

**Blockers (exact):**
1. **No Expo authentication** — `eas whoami` returns `Not logged in`; `EXPO_TOKEN` not set. EAS CLI 20.1.0 rejects all `eas build` commands (including `--local`) without authentication, even for local builds. This is by design — local builds still require EAS auth for credential resolution.
2. **Placeholder EAS project ID** — `apps/mobile/app.config.ts` and `.env.development` contain `EAS_PROJECT_ID=00000000-0000-0000-0000-000000000000`. No real Expo project has been created/linked (`eas init` / `eas project:create` never run). Even after `eas login`, `eas build` would fail with `Project not found`.
3. **No Apple Developer credentials** — no `credentials.json`, no Apple Team ID, no provisioning profile configured for `com.mobilesaas.app.dev`. Local iOS builds would require Xcode signing to be configured after EAS linking.

**Not attempted due to blockers:**
- `eas build --profile development` (cloud)
- `eas build --local` (requires same auth)
- `npx expo prebuild` + `xcodebuild` would be possible as pure-local fallback but is explicitly out of scope per Milestone 3 requirement of "actual native EAS development build" — not claimed as substitute.

**Remediation to unblock:**
```bash
eas login                 # or set EXPO_TOKEN
eas project:init          # link apps/mobile to a real Expo project, sets EAS_PROJECT_ID
# configure Apple credentials via `eas credentials` or Xcode automatic signing
eas build --profile development --platform ios
```

No credentials were invented. No secrets were exposed.

---

## 2. Install on Simulator/Device

### Environment Available

```
$ xcrun simctl list devices available
-- iOS 26.2 --
    iPhone 17 Pro (F3BA3CB6-59B1-4E56-9123-F0A3F12C7001) (Booted)
    iPhone 17 Pro Max (Shutdown)
    iPhone Air, iPhone 17, iPhone 16e, iPad variants (Shutdown)
```

Xcode: `/Applications/Xcode.app/Contents/Developer` (selected)
CocoaPods: 1.16.2
Node: via nvm 24.16.0

### Verdict

```
Device/simulator: iPhone 17 Pro (Booted) — available, not used (no artifact)
App launch: BLOCKED (no .app / .ipa produced)
Real authentication: NOT VERIFIED on device (blocked upstream)
Organization onboarding: NOT VERIFIED on device (blocked upstream)
```

No install was attempted because no EAS artifact exists. No mock was substituted.

---

## 3. Maestro E2E

### Flows Inspected

Location: `.maestro/` (root, not `apps/mobile/.maestro`)
- `.maestro/config.yaml` → `appId: com.mobilesaas.app`, `workspaceId: local`
- `.maestro/flows/appLaunch.yaml` — `launchApp clearState` → assert "Sign in", "Welcome"
- `.maestro/flows/auth.yaml` — tap "Sign in" → input "demo@example.com" → tap "Continue" → assert "Home" → via Settings → Sign out → assert "Sign in" + "Protected route"
- `.maestro/flows/deepLink.yaml` — open `mobile-saas-dev://invite/ABC123` → assert "Sign in" → auth → assert "Invite"
- `.maestro/flows/onboarding.yaml` — "newuser@example.com" → "Welcome" → "Create Organization" → "Acme" → "Create" → "Home"
- `.maestro/flows/protected.yaml` — tap "Home" unauthenticated → assert "Sign in"

**Static analysis notes (no execution, for future fix):**
- `appId: com.mobilesaas.app` in flows does not match development variant `com.mobilesaas.app.dev` (app.config.ts). Flows would not resolve on development build without variant-specific config. Intent appears to be production `appId`; development run would need `--appId com.mobilesaas.app.dev` or separate config.
- `auth.yaml` uses `inputText` + `tapOn: "Continue"` but actual `sign-in.tsx` has `Button label="Sign in"` and `password` field — flow lumps email+password into single step, would fail without password input step.
- `onboarding.yaml` creates org with single word "Acme" — slug generation is `toLowerCase().replace(/\s+/g, '-')` so "acme" is valid.
- No flow currently exercises Better Auth → Hono → PostgreSQL error cases (e.g., duplicate email); happy-path only.

### Execution Attempt

```bash
$ which maestro
maestro not found
$ brew info maestro
maestro (Maestro): 0.17.3 (auto_updates) — Not installed
$ brew list | grep maestro
(no output)
```

Maestro CLI not installed on this machine. The Homebrew cask (`maestro`) is the Maestro Studio App (App), not the CLI (`maestro` binary from https://get.maestro.mobile.dev which requires Java 17+). No CLI was installed during this validation to avoid uncontrolled network installs.

### Verdict

```
Maestro:
Flow 1 (appLaunch):   BLOCKED — not executed (no dev build, no CLI)
Flow 2 (auth):        BLOCKED — not executed
Flow 3 (deepLink):    BLOCKED — not executed
Flow 4 (onboarding):  BLOCKED — not executed
Flow 5 (protected):   BLOCKED — not executed
```

**Blockers:**
1. No development build artifact to install on simulator
2. Maestro CLI not installed locally
3. App under test not running (no Expo dev client / simulator install)

**Remediation:**
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash  # requires Java 17
maestro --version
# After EAS build installed on Booted iPhone 17 Pro:
maestro test .maestro/flows/appLaunch.yaml
maestro test .maestro/flows/*.yaml
```

No flow was rewritten. Results are accurate — not fabricated as PASS.

---

## 4. CI

### Workflow Inspected

`.github/workflows/ci.yml`:
- Triggers: `push: branches [main]`, `pull_request: branches [main]`
- Concurrency: `ci-${{ github.ref }}` cancel-in-progress
- Runner: `ubuntu-latest`
- Steps: `actions/checkout@v4` → `pnpm/action-setup@v4` (v10) → `setup-node@v4` (node 20, cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → `db:generate --dry-run (continue-on-error)`

Workflow is correctly defined and matches local validation commands.

### Trigger Attempt

```bash
$ git remote -v
(no output)
$ gh repo view --json nameWithOwner
failed to determine base repo: no git remotes found
$ gh run list --limit 5
failed to determine base repo: no git remotes found
```

```bash
$ gh auth status
✓ Logged in to github.com account kranthik10 (keyring)
  Active account: true
  Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

**Blocker:** No git remote configured in this checkout. The repository is not connected to a GitHub remote (`git remote -v` empty), so no `git push` can trigger `on: push` and `gh run list/watch` has no repo context. `gh` is authenticated as `kranthik10` and has sufficient scopes, but lacks a target repository.

### Local CI Simulation (equivalent steps run locally)

```bash
$ pnpm lint       # Tasks: 14 successful
$ pnpm typecheck  # Tasks: 26 successful
$ pnpm test       # Test Files 4 passed, Tests 30 passed (30)
$ pnpm build      # Tasks: 14 successful, expo export → dist
$ pnpm --filter @repo/database db:generate --dry-run  # (not run — schema sync via db:push in Milestone 2)
```

All steps that CI runs locally pass. This is not claimed as CI PASS — local pass ≠ GitHub Actions run.

### Verdict

```
CI: BLOCKED
CI run: — (no remote, no dispatch)
Checks (local equivalent):
  typecheck: PASS
  lint:      PASS
  test:      PASS (30)
  build:     PASS
  db:generate dry-run: NOT RUN (requires prior migration state)
CI on GitHub: BLOCKED — no git remote, cannot push/trigger
```

**Remediation:**
```bash
git remote add origin https://github.com/<org>/<repo>.git
git push -u origin main
# or: gh repo create <name> --public --source=. --push
gh run list --repo <org>/<repo>
gh run view <run-id> --log
```
Or create remote via GitHub UI and push `0dae428` + this doc commit.

No secrets were required or exposed. `EXPO_TOKEN`, `TURBO_TOKEN`, or DB URLs are not referenced in CI and not needed for this workflow.

---

## 5. Local Regression Validation

Run after inspection (no code changes made to app logic):

```bash
$ pnpm typecheck
Tasks:    26 successful, 26 total

$ pnpm lint
Tasks:    14 successful, 14 total

$ pnpm test
Test Files  4 passed (4)
Tests  30 passed (30)

$ pnpm build
Tasks:    14 successful, 14 total
Exported: dist

Tests: 30 → 30 (no change, expected)
```

`npx expo config --type public` also passes (loads `.env.development` without error, resolves app.config.ts variant correctly).

All local checks remain PASS, identical to Milestone 2 checkpoint `0dae428`.

---

## 6. Summary

| Item | Status | Evidence |
|------|--------|----------|
| **EAS development build** | **BLOCKED** | `eas whoami: Not logged in`; `eas build --local`: requires Expo account; `EAS_PROJECT_ID` is placeholder `000...` |
| **Build ID** | — | No build initiated |
| **Platform** | iOS (intended), Android defined | `eas.json` has both; iOS devClient true |
| **Device/simulator** | Available, unused | iPhone 17 Pro Booted (F3BA3CB6...) via `xcrun simctl` |
| **App launch** | BLOCKED | No artifact to install |
| **Real authentication** | NOT VERIFIED on device | Blocked upstream — local DB + Better Auth verified in Milestone 2 only |
| **Organization onboarding** | NOT VERIFIED on device | Blocked upstream — local tRPC + DB verified in Milestone 2 only |
| **Maestro Flow 1 appLaunch** | BLOCKED | No CLI, no build |
| **Maestro Flow 2 auth** | BLOCKED | No CLI, no build |
| **Maestro Flow 3 deepLink** | BLOCKED | No CLI, no build |
| **Maestro Flow 4 onboarding** | BLOCKED | No CLI, no build |
| **Maestro Flow 5 protected** | BLOCKED | No CLI, no build |
| **CI** | BLOCKED | No git remote; workflow valid; local equivalent PASS |
| **typecheck** | PASS | 26 tasks |
| **lint** | PASS | 14 tasks |
| **test** | PASS | 30 tests |
| **build** | PASS | expo export |

**No application code was modified in this milestone.** EAS/Maestro/CI blockers are environmental (auth, project linking, remote, tool installation) — not application bugs. No fixes for billing/notifications/offline/AI were made per scope.

---

## 7. Next Actions (to achieve PASS)

1. **EAS:** `eas login` + `eas project:init` (or set `EXPO_TOKEN` in CI) → re-run `eas build --profile development --platform ios`
2. **Maestro:** Install CLI (`curl -Ls https://get.maestro.mobile.dev | bash`), install build on Booted iPhone 17 Pro (`xcrun simctl install booted <app>`), run `maestro test .maestro/flows/*.yaml`
3. **CI:** Add GitHub remote and push, or `gh repo create` — then verify `gh run view` shows `validate` job PASS
4. Re-run this doc with actual IDs/outputs and create `chore: validate eas maestro and ci` checkpoint

---

## 8. Remediation — 2026-09-01 — CI Validation (EAS/Maestro Deferred per instruction)

**Scope of this remediation:** EAS and Maestro deliberately deferred (no `eas login`, no build, no `maestro` install). Focus was GitHub CI only plus safe Maestro config fix. Per instruction: `kranthik10/supastarter-expo` as canonical remote.

### 8.1 GitHub Remote

```bash
$ git remote -v
origin  https://github.com/kranthik10/supastarter-expo.git (fetch)
origin  https://github.com/kranthik10/supastarter-expo.git (push)

$ gh repo view kranthik10/supastarter-expo --json nameWithOwner
{"nameWithOwner":"kranthik10/supastarter-expo","isPrivate":false}
```

Remote added via `git remote add origin https://github.com/kranthik10/supastarter-expo.git`. Repository did not exist on first check (`Repository not found`); created via `gh repo create kranthik10/supastarter-expo --public` then pushed `main`. **Not an arbitrary repo — developer-specified `kranthik10/supastarter-expo`.**

### 8.2 CI Workflow Inspection & Fixes

**Original CI blocker 1:** `pnpm/action-setup@v4` with `version: 10` vs `package.json: pnpm@11.24.0` → `ERR_PNPM_BAD_PM_VERSION` (run `33453279830`, `33453339078`). Fix: remove `version` key entirely and let action infer from `packageManager` field (`commit 854b664`).

**Original CI blocker 2:** `pnpm@11.24.0 requires at least Node.js v22.13` but `actions/setup-node@v4` used `node-version: 20` → `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` (run `33453374228`). Fix: bump `node-version` to `24` (`commit 4276710`).

**Final `.github/workflows/ci.yml` after fixes:**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4         # no version — inferred from packageManager
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm --filter @repo/database db:generate --dry-run (continue-on-error)
```

No secrets, no machine-specific assumptions. Workflow matches local `pnpm lint/typecheck/test/build`.

### 8.3 CI Push & GitHub Actions Result

```bash
$ git push -u origin main  (commit 6acb582) → 33453339078 FAIL (pnpm version mismatch)
$ git push (commit 854b664) → 33453374228 FAIL (Node 20 vs pnpm 11.24)
$ git push (commit 4276710) → 33453409645 PASS
```

**Passing run — `33453409645` (`fix: bump CI node to 24 for pnpm 11.24`):**

```
✓ validate in 3m11s (ID 99688120201)
  ✓ Set up job
  ✓ Run actions/checkout@v4
  ✓ Run pnpm/action-setup@v4   (inferred pnpm 11.24.0)
  ✓ Run actions/setup-node@v4 (Node 24)
  ✓ Run pnpm install --frozen-lockfile
  ✓ Run pnpm lint
  ✓ Run pnpm typecheck
  ✓ Run pnpm test
  ✓ Run pnpm build
  ✓ DB generate check
```
Link: `https://github.com/kranthik10/supastarter-expo/actions/runs/33453409645`

All four parity checks identical to local validation ran on `ubuntu-latest` and passed.

### 8.4 Maestro Configuration Fix (safe, no CLI install)

As authorized, fixed development bundle-ID mismatch without running Maestro:

```diff
- appId: com.mobilesaas.app
+ appId: com.mobilesaas.app.dev   # .maestro/config.yaml + 5 flows
```

Verified against `apps/mobile/app.config.ts`:

```ts
development: { bundleIdSuffix: '.dev' } → com.mobilesaas.app.dev
preview:     { bundleIdSuffix: '.preview' } → com.mobilesaas.app.preview
production:  { bundleIdSuffix: '' } → com.mobilesaas.app
```

Change applied in commit `6acb582` (`fix: align ci pnpm version and maestro dev bundle id`). Production ID preserved as comment in `config.yaml`. No flow logic rewritten. Flows still deferred (`BLOCKED — waiting for development build`) per instruction.

### 8.5 Local Regression After Remediation

```bash
$ pnpm typecheck  → 26 successful
$ pnpm lint       → 14 successful
$ pnpm test       → 4 passed, 30 passed (30)
$ pnpm build      → 14 successful, Exported: dist
```

Identical to checkpoint `0dae428` + `716259d`.

### 8.6 Remediation Summary

```
EAS authentication:       DEFERRED (per instruction — not attempted)
Expo project linking:     DEFERRED (requires eas login)
Development build:        DEFERRED
Simulator installation:   DEFERRED
Maestro installation:     DEFERRED
Maestro Flow 1:           DEFERRED — config fixed to com.mobilesaas.app.dev, not executed
Maestro Flow 2:           DEFERRED
Maestro Flow 3:           DEFERRED
Maestro Flow 4:           DEFERRED
Maestro Flow 5:           DEFERRED
GitHub remote:            PASS (kranthik10/supastarter-expo, public, pushed)
CI:                       PASS (run 33453409645, 3m11s, all steps ✓)
Local validation:         PASS (typecheck/lint/test 30/build)
```

