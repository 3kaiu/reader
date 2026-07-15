# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nexus Reader** is a self-hosted reading workspace for web novels and books. It is a multi-service monorepo:

| Directory | Purpose | Tech |
|---|---|---|
| `web/` | Frontend SPA (reader UI) | Vue 3, TypeScript, Rsbuild, Tailwind CSS 4, Pinia |
| `api/` | Backend (content fetch/extract/store/API) | Rust workspace: `nexus-core`, `nexus-engine`, `nexus-storage`, `nexus-server` |
| `edge/` | Cloudflare Worker (edge proxy/cache) | TypeScript, Wrangler |
| `bypass/` | HTTP fetch service (anti-bot bypass) | Python, FastAPI, cloudscraper |
| `contracts/` | Shared route contracts (JSON + codegen scripts) | Node scripts |
| `scripts/` | Repo-level automation (Legado source pipeline, contract validation) | Python, Node |

Architecture: Browser → Edge Worker → Nexus API → Bypass service (optional). The frontend also talks directly to the API for some routes.

## Build & Dev Commands

Run from the relevant subdirectory (no root package.json).

### Web (`web/`)

```bash
bun install                # deps (use bun, not npm)
bun run dev                # dev server at localhost:5173 (proxies /api → :8080)
bun run build              # production build → web/dist/
bun run lint               # ESLint --fix
bun run lint:check         # ESLint no-fix
bun run format             # Prettier write
bun run type-check         # vue-tsc
bun run test               # Vitest unit tests (--run)
bun run test:watch         # Vitest watch mode
bun run test:coverage      # Vitest + V8 coverage
bun run test:properties    # fast-check property-based tests
bun run contracts:generate # regenerate route constants from contracts
bun run contracts:validate # validate contracts
```

Single test: `bunx vitest run path/to/test.test.ts`

### Rust API (`api/`)

```bash
cargo check --workspace                  # type-check
cargo test --workspace --quiet           # all tests
cargo test --package nexus-engine -- test_name  # single test
cargo clippy --workspace                 # lint
cargo fmt                                # format
cargo build --release --package nexus-server
```

Offline HTML fixtures for regression: `nexus-engine/tests/fixtures/69shuba/`

### Edge Worker (`edge/`)

```bash
npm ci                   # deps
npm run dev              # wrangler dev (local)
npm run deploy           # wrangler deploy
npm run type-check
npm run test             # Vitest
npm run contracts:generate
npm run contracts:validate
```

### Bypass Service (`bypass/`)

```bash
uv sync                                          # deps
uv run uvicorn main:app --reload --port 8000     # dev server
```

### Contracts (repo root)

```bash
node scripts/validate-contracts.mjs              # validate route contracts
node scripts/generate-http-route-constants.mjs   # regenerate generated TS constants
```

**Run contract validation after any API route/endpoint change.**

## Code Style

### TypeScript / Vue (`web/`)
- 2-space indent, no semicolons, single quotes, 100 char max width
- Trailing commas: ES5-style; arrow parens: avoid when single param
- `PascalCase.vue` components, `<script setup>` + Composition API
- `@/` alias → `web/src/`
- Config: `.prettierrc.json`, `.eslintrc.json`

### Rust (`api/`)
- `rustfmt` (config: `api/rustfmt.toml`): 100 cols, 4-space, Unix LF
- `snake_case` modules/functions, `PascalCase` types/traits
- Clippy caps: cognitive complexity 30, type complexity 250 (`.clippy.toml`)
- Toolchain: `api/rust-toolchain.toml` (stable)

### Python (`bypass/`)
- PEP 8, FastAPI + Pydantic patterns

## Key Architecture Notes

**Rust workspace dependency order**: `nexus-core` → `nexus-engine` → `nexus-storage` → `nexus-server`. `nexus-core` has no external HTTP/net deps (pure domain types). Two engine types coexist: `NxsEngine` (native selectors) and `LegadoEngine` (Legado-format book sources, with `@js:`/CSS/JSONPath/regex via rquickjs). `EngineRegistry` in `nexus-server` maintains separate caches for each.

**Legado sources**: Loaded from `api/sources/legado/` (`*.json`/`*.legado`, non-recursive, skips `ALL.json`/`legado-quality.json`/`analysis.json`). Daily pipeline at `scripts/daily-legado-fetch.py`.

**Contracts**: `contracts/http-routes.json` is the canonical route definition. Codegen produces `route-policy.constants.generated.ts`. Both `web/` and `edge/` consume these.

**Frontend entry**: `web/src/index.ts` — Vue app, Pinia, router, SW registration. Hash-based routes: `/`, `/reader`, `/search`, `/sources`, `/replace-rule`, `/settings`.

**Edge entry**: `edge/entry.ts` — validates env bindings, creates dispatcher, handles CORS preflight. Deployment envs: `production`/`staging` in `wrangler.toml`.

**Service Worker**: `public/sw.js` — chapter content caching via IndexedDB, persistent storage, cache policy via `postMessage`.

## Commit Convention

Conventional commits: `feat:`, `refactor:`, `fix:`, `ci:`, `docs:`. Optional scope: `feat(web):`, `fix(api):`. One logical change per commit.

## Security

- Never commit `.env`, SSH keys, or credentials (filtered by tool config).
- Rate limiting: `tower-governor` with Smart IP extraction on the API.
- CORS on both API (`CorsLayer`) and Worker. Worker supports `CORS_EXTRA_ORIGINS` env var.
- Request ID propagated via `X-Request-Id`.
- Dependency overrides in `web/package.json`: `defu`, `picomatch`, `tar`, `yaml` pinned to patched versions.

## CI

`.github/workflows/ci.yml` runs on PRs to `main`/`master` (path-filtered): actionlint, contract validation, frontend type-check + tests, backend cargo check + tests, edge type-check.

For deeper module details, see `AGENTS.md`.
