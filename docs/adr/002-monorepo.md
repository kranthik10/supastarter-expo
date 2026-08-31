# ADR-002 — Why Monorepo (pnpm + Turborepo)

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Starter must share types, UI, and backend logic across app and API without copy-paste or version drift.
- **Decision:** pnpm workspaces + Turborepo. Layout: `apps/mobile` + `packages/{api,auth,database,organizations,permissions,billing,notifications,storage,analytics,config,types,ui}` + `tooling/{eslint,prettier,typescript}`.
- **Alternatives:** Single-package repo, npm/yarn workspaces alone, Nx.
- **Consequences:** Incremental builds and remote caching; pnpm's content store keeps `node_modules` small; package boundaries enforced by `import` lint rules; `create-mobile-saas` templates the whole repo.
