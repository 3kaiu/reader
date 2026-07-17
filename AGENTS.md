# Nexus Reader — Repository Overview

This document is written for AI coding agents onboarding into this monorepo. It describes the project's architecture, module layout, development workflows, conventions, and deployment model so you can understand the codebase and make changes confidently.

---

## Project Overview

**Nexus** is a self-hosted reading workspace for web novels and books. It fetches content from configured book sources, extracts clean text, and presents it in a modern reading UI with offline support, search, progress syncing, and replace rules.

The repository is a multi-service monorepo containing six runtime components and shared contracts:

| Directory | Purpose | Tech Stack |
|---|---|---|
| `web/` | Frontend SPA — the reader UI | Vue 3, TypeScript, Rsbuild, Tailwind CSS 4, Pinia |
| `api/` | Rust backend — content fetching, extraction, storage, AI decoding, API server | Rust (workspace: `nexus-core`, `nexus-engine`, `nexus-storage`, `nexus-server`, `nexus-ai`) |
| `edge/` | Cloudflare Worker — edge proxy, caching, routing | TypeScript, Wrangler |
| `bypass/` | Python HTTP fetch service — bypass Cloudflare/anti-bot | Python, FastAPI, cloudscraper |
| `ai-inference/` | Python AI inference service — alias decoding, chapter scanning, context analysis | Python, FastAPI, Ollama/MLX |
| `contracts/` | Shared route/policy contracts consumed by `web` and `edge` | JSON + JS scripts |

---

## Architecture Overview

```
┌────────────┐      ┌──────────────┐      ┌──────────────┐
│  Browser   │ ───▶ │  Edge Worker │ ───▶ │  Nexus API   │
│  (web/)    │      │  (edge/)     │      │  (api/)      │
└────────────┘      └──────────────┘      └───┬───┬───┬──┘
       │                                      │   │   │
       │                                 ┌────▼┐ ┌▼───┴──────┐
       └──────────────────────────────▶ │Bypass│ │AI-Infer    │
           (skips Worker for some       │svc   │ │(ai-infer/) │
            routes)                     │(bypa/│ │decode/scan │
                                        └──────┘ └───────────┘
```

- **Frontend**: A Vue 3 SPA served by Cloudflare Pages. It talks to the Nexus API directly for reads/writes, and to the Worker for proxied requests. The dev server (`localhost:5173`) proxies `/api` to `localhost:8080` via Rsbuild's built-in proxy.
- **Edge Worker**: A Cloudflare Worker that validates requests, handles CORS, proxies API calls, and caches content in a KV namespace. Deployment is managed via `wrangler.toml` with production/staging environments.
- **Nexus API**: A Rust HTTP server (axum framework) that handles book source management, content fetching and extraction, search, bookshelf/library CRUD, replace rules, and sync. Runs as a Docker container on the user's NAS or server.
- **Bypass Service**: An optional Python FastAPI service that handles fetching pages behind Cloudflare/anti-bot protections. The Nexus API calls it when a source requires it. Not always deployed.
- **AI Inference Service**: An optional Python FastAPI service for alias/context decoding and chapter scanning. Used by the AI Decoder feature. Runs locally on the dev machine or as a sidecar container with Ollama backend. See `PLANS/ai-decoder.md`.

---

## Module Deep Dive

### `web/` — Frontend

**Entry**: `src/index.ts` — creates Vue app, registers Pinia stores, sets up router, loads settings, mounts Service Worker.

**Routes** (hash-based):
- `/` — Bookshelf (home page, book listing with virtual scrolling)
- `/reader` — Reader page (scroll-based or paged reading)
- `/search` — Search across book sources
- `/sources` — Manage book source definitions
- `/replace-rule` — Manage text replace rules
- `/settings` — App settings

**Key directories**:
- `src/api/` — HTTP client layer (`$get`, `$post`, etc.), transport with fallback, route policy, error handling system
- `src/components/` — Vue components organized by feature (bookshelf, reader, search, source, replace, settings, ui primitives)
- `src/composables/` — Composable functions for state management patterns (reader chrome/experience lifecycle, bookshelf, source/replace management)
- `src/stores/` — Pinia stores (library, reader, source, replace, settings, offline-storage) with state/actions/view pattern
- `src/services/` — Offline content manager (IndexedDB-backed), sync manager
- `src/utils/` — Utilities: IndexedDB abstraction, error handling framework, logger, browser storage, batch mutation
- `src/types/` — TypeScript type definitions
- `src/constants/` — App-wide constants
- `src/styles/` — Tailwind CSS 4.x theme system (HSL-based, shadcn style)
- `src/tests/` — Unit tests, integration tests, E2E test, unified test framework, property-based tests

**Build tool**: Rsbuild (Rspack-based successor to webpack). Config: `rsbuild.config.ts`. The dev server proxies `/api` to `localhost:8080` and `/ws/search` to `localhost:8080` with WebSocket.

### `api/` — Rust Backend Workspace

Workspace members (in dependency order):

1. **`nexus-core`** — No external HTTP/net deps. Defines:
   - `NxsSource` — the canonical book source model (serialized as `*.nxs`)
   - `LegadoSource` — Legado-format book source model (serialized as `*.json`), matching the Android app's `BookSource` data class. Supports `Vec<LegadoSource>` bulk imports.
   - Error types (`EngineError`), config (`EngineConfig`), event bus, traits (`Fetcher`, `AntiCrawlStrategy`)
   - Type modules: `books`, `content`, `fetch`, `source`, `library`, `discovery`, `ai`, `voice`

2. **`nexus-engine`** — The content engine:
   - `NxsEngine` — executes compiled selectors (with fallback syntax `|`) against fetched HTML
   - `LegadoEngine` — native Rust executor for Legado book sources. Directly executes `@js:`, CSS selectors, JSONPath, regex via `rquickjs`/Node.js fallback. Implements `BookEngine` + `BookEngineRuntime` traits.
   - Legado rule parser: `||` (fallback), `&&` (concat), `%%` (merge) operators; auto-detects JS/JSON/CSS/XPath/Regex modes
   - Content fetching (`content_fetch`, `fetcher/` with domain-pooled HTTP clients)
   - Content extraction pipeline (`content_extract`, `content_pipeline`, readability/mozilla wrapper)
   - Anti-crawl strategies (Cloudflare bypass via external service, direct HTTP, fallback chain)
   - Content cleaning: font decryption, text deduplication, zero-width char removal, dynamic noise removal
   - ML scoring for extraction quality, quality gate, extraction metrics
   - Circuit breaker for reliability, domain connection pooling, user-agent rotation
   - Offline HTML fixtures for regression tests (`tests/fixtures/69shuba/`)

3. **`nexus-storage`** — Persistence layer:
   - `ChapterCache` — two-level cache (moka in-memory + disk files)
   - `SledStore` — embedded persistent KV store (sled)
   - `SourceStore` — JSON-based NXS source config storage on the filesystem
   - `LegadoSourceStore` — JSON-based Legado community source storage (loads `*.json`/`*.legado` from `sources/legado/`, skips `ALL.json`/`legado-quality.json`)
   - Optional file watching via `notify` crate (feature `watch`)
   - MD5-based cache keys, parking_lot sync primitives

4. **`nexus-server`** — HTTP API server:
   - axum-based router with CORS, tracing, rate limiting (tower-governor with Smart IP extraction)
   - Routes: source CRUD (NXS + Legado), search (with streaming WebSocket), book, chapters, content, bookshelf, groups, replace_rules
   - Legado-specific routes:
     - `POST /api/sources/legado/import` — import one or more `LegadoSource` JSON objects (accepts single or array)
     - `GET /api/sources/legado` — list all imported Legado sources with classification metadata
     - `DELETE /api/sources/legado/{id}` — remove a Legado source
   - `EngineRegistry` — multi-engine cache supporting both `NxsEngine` and `LegadoEngine` via `BookEngine`/`BookEngineRuntime` trait objects
   - Middleware: request ID propagation, CORS, tracing, compression (brotli + gzip)
   - Config: `config.json` (server host/port, sources dir, feature flags)
   - **Entry**: `src/main.rs` — initializes logging (env-filter `RUST_LOG`), loads config, starts axum

### `edge/` — Cloudflare Worker

**Entry**: `edge/entry.ts` — validates environment bindings, creates a stable dispatcher, handles CORS preflight, catches errors.

- `entry/dispatch.ts` — request routing
- `entry/validation.ts` — worker env validation
- `entry/errors.ts` — error message extraction
- `shared/` — cache, CORS, logger, proxy, request-id, types
- `worker/` — worker-specific types and HTTP utilities
- `tests/` — Vitest-based tests

Deployment environments: `production` and `staging` in `wrangler.toml`.

### `ai-inference/` — Python AI Inference Service

- FastAPI application exposing `/decode`, `/scan`, `/health` endpoints
- Pluggable model backends: Ollama (anywhere), MLX (macOS dev), llama.cpp (NAS CPU)
- Default model: Qwen2.5-7B (quantized)
- **Decode pipeline**: on-demand alias/entity resolution for selected text
- **Scan pipeline**: full-chapter batch analysis for alias/event extraction
- JSON-formatted structured output for deterministic parsing
- See `PLANS/ai-decoder.md` for full design

### `bypass/` — Python Fetch Service

- FastAPI application exposing `/fetch` and `/health` endpoints
- Uses `cloudscraper` to bypass Cloudflare challenge pages
- Engine selection via `core/engine_factory.py` (currently `scraper`)
- Concurrency-limited (semaphore, default 20 max)
- Optional API key auth for `/fetch` endpoints
- Published as a Docker container alongside the API stack

### `contracts/` — Shared Contracts

- `http-routes.json` — canonical route definitions with `routing`, `frontend`, `worker`, `backend` sections
- `scripts/validate-contracts.mjs` — validates route shapes across modules (used in CI)
- `scripts/generate-http-route-constants.mjs` — generates TypeScript constants (`route-policy.constants.generated.ts`, `user-service-prefixes.generated.ts`) from the contracts JSON
- `scripts/apply-wrangler-placeholders.mjs` — replaces placeholders in `wrangler.toml` at deploy time

---

## Build, Test, and Development Commands

Run each command from the relevant subdirectory unless noted.

### Web (`web/`)

```bash
bun install                              # Install dependencies (bun, not npm)
bun run dev                              # Dev server at localhost:5173
bun run build                            # Production build to web/dist/
bun run build:analyze                    # Build + bundle analysis report
bun run lint:check                       # ESLint check (no auto-fix)
bun run lint                             # ESLint with --fix
bun run format:check                     # Prettier check
bun run format                           # Prettier write
bun run type-check                       # vue-tsc type checking
bun run test                             # Vitest unit tests (--run)
bun run test:watch                       # Vitest in watch mode
bun run test:coverage                    # Vitest with V8 coverage
bun run test:properties                  # Property-based tests with fast-check
bun run contracts:generate               # Regenerate route constants from contracts
bun run contracts:validate               # Validate contracts
```

### Rust API (`api/`)

```bash
cargo check --workspace                  # Type-check all crates
cargo test --workspace --quiet           # Run all tests
cargo clippy --workspace                 # Lint
cargo fmt                                # Format code
cargo build --release --package nexus-server  # Release build
```

The toolchain is configured in `api/rust-toolchain.toml` (stable channel, rustfmt + clippy).

### Edge Worker (`edge/`)

```bash
npm ci                                   # Install dependencies
npm run dev                              # wrangler dev (local)
npm run deploy                           # wrangler deploy
npm run type-check                       # TypeScript check via tsconfig
npm run test                             # Vitest tests
npm run contracts:generate               # Regenerate route constants
npm run contracts:validate               # Validate contracts
```

### Bypass Service (`bypass/`)

```bash
uv sync                                  # Install deps via uv (requirements in pyproject.toml + uv.lock)
uv run uvicorn main:app --reload --port 8000  # Dev server
```

### Contracts (repo root)

```bash
node scripts/validate-contracts.mjs      # Validate route contracts
node scripts/generate-http-route-constants.mjs  # Regenerate generated TS constants
```

---

## Code Style & Naming Conventions

### TypeScript / Vue (`web/`)

Enforced by Prettier + ESLint (`.prettierrc.json`, `.eslintrc.json`).

- 2-space indentation, no semicolons, single quotes
- Max line width: 100 characters
- Trailing commas: ES5-style (where valid)
- Arrow parens: avoid when single param
- End of line: LF
- `PascalCase.vue` for component file names
- `camelCase` for variables, functions, and `kebab-case` for template props/events
- Components use Vue 3 `<script setup>` syntax and Composition API
- Props/emit types are often defined in separate type files (see `src/components/reader/` pattern)
- `@/` path alias maps to `web/src/`

### Rust (`api/`)

Formatted by `rustfmt` with config in `api/rustfmt.toml`.

- Max width: 100 columns
- 4-space tabs, Unix line endings
- `snake_case` for module names, functions, and variables
- `PascalCase` for types, structs, enums, traits
- Use field init shorthand, try shorthand
- Reorder imports, merge derives
- Clippy caps: cognitive complexity 30, type complexity 250 (`.clippy.toml`)

### Python (`bypass/`)

- Basic PEP 8 style (no explicit linter config seen)
- FastAPI patterns with Pydantic models, async endpoints

---

## Testing Guidelines

### Frontend Tests (`web/`)

- **Framework**: Vitest (config: `vitest.config.ts` / `vitest.integration.config.ts`)
- **Unit tests**: `src/tests/**/*.test.ts`
- **Integration tests**: `src/tests/integration/` (separate vitest config, excluded from unit test run)
- **E2E tests**: Playwright (`playwright.config.ts`)
- **Property-based tests**: `fast-check` library, run via `bun run test:properties`
- **Coverage**: V8 provider, reports to `web/coverage/`
- **Global setup**: Crypto polyfill for Web Crypto API in Node test environment
- **Test files should mirror source structure when possible**, e.g. `src/utils/errors/` has corresponding tests in `src/tests/`

### Rust Tests (`api/`)

- Standard `#[test]` functions, integration tests, and `#[cfg(test)]` modules
- Offline HTML fixtures: `nexus-engine/tests/fixtures/69shuba/` for selector regression testing
- Some test-only modules: `incremental_parser`, `kuchiki_wrapper`, `lol_html_parser`, `library_integration_test`, `tests_69shuba_offline`
- Run with `cargo test --workspace --quiet`

### Edge Worker Tests (`edge/`)

- Vitest-based tests in `edge/tests/proxy.test.ts`
- Must pass `npm run type-check` (TypeScript compilation)

### Contract Validation

- **Always run** `node scripts/validate-contracts.mjs` after any API shape, route, or endpoint changes
- Regenerate constants with `node scripts/generate-http-route-constants.mjs` after contract changes

---

## Security Considerations

- **Sensitive files are filtered**: All project tools (Read, Write, Edit, Glob, Grep) filter out `.env` files, SSH keys, and credential stores by design. Do not bypass this.
- **CodeQL**: A code scanning configuration is at `.github/codeql-config.yml` with custom query packs. The workflow `security-scan.yml` is manual (`workflow_dispatch`).
- **Dependabot**: Configured in `.github/dependabot.yml` for dependency updates.
- **Dependency overrides** in `web/package.json`: `defu`, `picomatch`, `tar`, `yaml` are pinned to patched versions.
- **Rate limiting**: The API uses `tower-governor` with Smart IP extraction to rate-limit requests.
- **CORS**: Configured on both the API (CorsLayer in axum) and the Worker (shared CORS handler). The Worker supports `CORS_EXTRA_ORIGINS` env var.
- **Request ID**: Every request gets a unique ID propagated via headers (`X-Request-Id`) for traceability.
- **No secrets in code**: API keys, KV IDs, Cloudflare tokens are injected via environment variables or GitHub Actions secrets at deploy time.

---

## Deployment

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on PRs to `main`/`master` (path-filtered per module). Also supports `workflow_dispatch`. Checks in parallel:
- Workflow quality (actionlint)
- Contract validation
- Frontend type check + tests
- Backend cargo check + tests
- Edge type check

### Personal Deploy (`.github/workflows/deploy-personal.yml`)

Manual (`workflow_dispatch`). Runs quality checks, then:
1. Deploys the Worker to Cloudflare Workers
2. Builds the frontend and deploys it to Cloudflare Pages
3. Runs a smoke check (validates Pages response and optional API health)

### Docker Image (`.github/workflows/publish-nexus-server-image.yml`)

Manual (`workflow_dispatch`). Builds and pushes `ghcr.io/<owner>/nexus-server:latest` (multi-arch: amd64 + arm64). Used for NAS/self-hosted deployments.

### FNOS / NAS Deployment

Two Docker Compose files serve different stack configurations:

- **`docker-compose.fnos.yml`** (repo root) — runs both `api` (GHCR image) and `bypass` (local build) services
- **`deploy/fnos/docker-compose.yml`** — runs `nexus-server` image + Watchtower for auto-updates on NAS
- See `deploy/fnos/.env.example` for environment configuration

### Service Worker & Offline

The web app registers a Service Worker (`public/sw.js`) in production for:
- Chapter content caching (IndexedDB-backed, with configurable max entries and TTL)
- Persistent storage request via `navigator.storage.persist()`
- Cache policy communicated via `postMessage` between app and SW

---

## Book Source (NXS) Model

Book sources are defined in the `NxsSource` format (Rust struct in `nexus-core`), serialized as JSON in `*.nxs` files. Example sources live in `api/sources/`:

- `api/sources/69shuba.nxs`
- `api/sources/hetushu.nxs`
- `api/sources/sudugu.nxs`

**Import paths**:
1. `POST /api/sources` — accepts `NxsSource` JSON body, persists as `{sources_dir}/{id}.nxs`, invalidates engine cache
2. `POST /api/source-packages/import` — accepts a full `SourceRulePackage` (source + fetch/search profiles + validation reports)

The source directory path is configured in `api/nexus-server/config.json` (`storage.sourcesDir`).

---

## Legado Book Source Engine

The project now includes a native Rust Legado engine that directly executes Legado-format JSON book sources without conversion.

### Data Model (`nexus-core`)

`LegadoSource` in `api/nexus-core/src/legado.rs` matches the Android app's `BookSource` data class with all sub-rules (`SearchRule`, `BookInfoRule`, `TocRule`, `ContentRule`, `ExploreRule`, `ReviewRule`). Helper methods:
- `infer_id()` — generates stable ID from URL
- `classification()` — returns `"webjs"`, `"js"`, `"xpath"`, or `"css"`
- `is_fully_automatable()` — `true` for pure CSS sources (no webJs, no XPath)

### Rule Parser (`nexus-engine/src/legado/rule_parser.rs`)

Parses Legado rule strings into `CompiledLegadoRule` with:
- **Combine operators**: `||` (fallback), `&&` (concat), `%%` (merge)
- **Mode detection**: auto-detects `@js:`, `<js>`, `@json:`, `@xpath:`, `@css:`, `@regex:`, `@text:` prefixes
- **Regex clean**: `##pattern##replacement` postfix
- **JS block awareness**: `find_top_level()` correctly skips `@js:` content with string/regex boundary awareness
- **Global LRU cache**: DashMap-backed, compile-once reuse

### Selectors (`nexus-engine/src/legado/selector/`)
- `css.rs` — wraps existing `FallbackSelector` + `scraper`
- `js.rs` — executes JS via sandboxed QuickJS (native) or Node.js fallback (dev)
- `json.rs` — JSONPath via `serde_json_path` with JSON pointer fast path
- `regex.rs` — regex match/replace with LRU cache

### Operators (`nexus-engine/src/legado/operator/`)
- `fallback.rs` — `||` semantics (try each, return first non-empty)
- `concat.rs` — `&&` semantics (concatenate all)
- `merge.rs` — `%%` semantics (zip by index, used in Explore rules)
- `regex_clean.rs` — `##pattern##replacement` post-processing

### Engine (`nexus-engine/src/legado/engine.rs`)

Full `BookEngine` trait implementation with all four core methods:

| Method | Implementation |
|---|---|
| `search()` | Resolves `searchUrl` template (`{{key}}`/`{key}`/`%s`), handles `@js:` prefixed URLs, supports compound URL+options format (`url,{method:'POST',body:'...'}`), fetches via anti-crawl chain, parses HTML or JSON response, applies `bookList`/`checkKeyWord` rules |
| `book_info()` | Fetches `bookUrl`, parses via `ruleBookInfo` (name, author, cover, intro, tocUrl, etc.) |
| `chapters()` | Fetches `tocUrl`, extracts `chapterList` via CSS/JS, maps `chapterName`/`chapterUrl` for each item |
| `content()` | Fetches `chapterUrl`, extracts via `ruleContent.content`, applies `sourceRegex`/`replaceRegex`, cleans zero-width chars |

Key features:
- **`header` parsing**: Handles JSON, Python dict literal, and key-value line formats from `LegadoSource.header`
- **`parse_legado_url()`**: Parses compound URL format `"url,{'method':'POST','body':'searchkey={{key}}&type=all'}"` including charset detection
- **`FetchContext`**: Uses `FallbackChain.execute()` with source headers, timeout from `respondTime`
- **Circuit breaker**: `circuit_state_label()` / `reset_runtime_state()` delegate to `FallbackChain` per-source breakers

### Storage (`nexus-storage`)

`LegadoSourceStore` in `api/nexus-storage/src/legado_source_store.rs`:
- Loads `*.json`/`*.legado` files from `api/sources/legado/`
- Supports both `Vec<LegadoSource>` (arrays) and single objects
- Skips `ALL.json`, `legado-quality.json`, `analysis.json`
- Non-recursive (only top-level files in the directory)

### Engine Registry (`nexus-server`)

`EngineRegistry` now maintains two caches (`nxs_cache` + `legado_cache`) and resolves the correct engine type via `get_book_engine()` / `get_runtime_engine()` trait-object accessors.

---

## Daily Legado Automation Pipeline

A Python script at `scripts/daily-legado-fetch.py` automates fetching, classifying, and importing community Legado book sources.

### Source Repositories
- **AOAOSTAR** (6 collections, ~5900 valid sources): JSON API at `https://legado.aoaostar.com/sources/*.json`
- **YCKCEO** (~5500 entries): HTML scraping at `https://www.yckceo.com/yuedu/shuyuan/index.html`

### Pipeline
1. `--fetch`: Download all sources, validate, classify
2. `--analyze`: Print classification breakdown
3. `--import-api URL`: POST classified sources to server API in batches of 100
4. `--auto`: Run full pipeline (fetch → save → import)

### Classification
- **webjs** (~0.0%): has `ruleContent.webJs` — requires WebView
- **js** (~53%): contains `@js:`/`<js>` patterns — needs JS engine
- **xpath** (~0.0%): contains `@xpath:` — needs conversion
- **css** (~47%): pure CSS selectors — fully automatable

### Output
- Per-collection JSON files → `api/sources/legado/`
- Consolidated `ALL.json` (all valid sources merged)
- Quality DB → `api/sources/legado/legado-quality.json`
- Individual source files → `api/sources/legado/individual/`

### Scheduling
A cron-style task fires daily at 03:07 (runs `--auto --import-api http://localhost:8080`).

---

## Commit & PR Guidelines

- Use conventional commits: `feat:`, `refactor:`, `fix:`, `ci:`, `docs:`, etc. Optionally scope with module e.g. `feat(web):`
- One logical change per commit, imperative subject line
- PRs should include: what changed and why, affected modules, validation evidence, and screenshots for UI changes
- After modifying contracts, run `node scripts/validate-contracts.mjs` and regenerate constants
- Update this file if you change build commands, conventions, or project structure
