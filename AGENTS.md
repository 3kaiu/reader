# Repository Guidelines

## Project Structure & Module Organization
This repository is a multi-service monorepo.

- `web/`: Vue 3 + TypeScript frontend (`src/`, `public/`, `scripts/`, `src/tests/`).
- `api/`: Rust workspace (`nexus-core`, `nexus-engine`, `nexus-storage`, `nexus-server`).
- `edge/`: Cloudflare Worker code and shared edge modules.
- `bypass/`: Python FastAPI service for bypass-related backend logic.
- `contracts/`: Shared API/route contracts (used by frontend and workers).
- `scripts/validate-contracts.mjs`: Cross-module contract validator used in CI.
- `scripts/generate-http-route-constants.mjs`: Regenerates `route-policy.constants.generated.ts` and `user-service-prefixes.generated.ts` from `contracts/http-routes.json` (`routing.edgeHandledApiPrefixes` + `routing.edgeHandledPathExtras` → frontend edge-only list; API prefixes alone → Worker user-service list). CI uses `--check`.

## Book sources (NXS) — canonical model

- **Source rules live in NXS**: the runtime type is `NxsSource` (`nexus-core`), serialized as JSON in a `*.nxs` file (for example under `api/sources/`). The engine and search orchestrator use this; treat it as the single source of truth for selectors, encoding, and content rules.
- **Primary import API**: `POST /api/sources` with a JSON body that matches `NxsSource` — persists via `SourceStore` to `{sources_dir}/{id}.nxs` and invalidates the engine cache. This is the path aligned with personal deployments and “import = NXS”.
- **Optional package import**: `POST /api/source-packages/import` accepts a full `SourceRulePackage` (includes the same `source` field plus metadata such as `fetchProfile`, `searchProfile`, validation reports). Use it for source-builder flows and storage of richer metadata; it is not required for reading if you only maintain `.nxs` files.
- **Cloudflare**: typically hosts the static reader and/or the Worker edge proxy (`edge/`); the Rust API that loads `.nxs` runs wherever you deploy `nexus-server` (not the Worker itself).
- **Offline HTML fixtures** (e.g. 69shuba regression): `nexus-engine/tests/fixtures/69shuba/`; selectors are validated against `api/sources/69shuba.nxs`, not a duplicate package JSON.
- **HuggingFace**: optional only. The default stack is Cloudflare + **nexus-server on NAS (GHCR)**; the reader does not depend on `@huggingface/*` npm packages. `HF_TOKEN` is for **manual** Space upload workflows (`deploy-cf-bypass-huggingface.yml`, `huggingface-deploy.yml`), not for the Worker/runtime code in this repo.
- **FNOS / NAS automation (optional)**: pushing to `main` runs `.github/workflows/publish-nexus-server-image.yml` (when `api/**` changes), which publishes `ghcr.io/<lowercase-owner>/nexus-server` (multi-arch). The default edge deploy is `.github/workflows/deploy-personal.yml` (Cloudflare Pages + Worker, plus a short smoke: Pages always; optional repo secrets `DEPLOY_SMOKE_PAGES_URL`, `DEPLOY_SMOKE_API_HEALTH_URL` for your Tunnel origin). To push **bypass/** to a HuggingFace Space manually, use `.github/workflows/deploy-cf-bypass-huggingface.yml` (`workflow_dispatch`; needs `HF_TOKEN`). To upload **`api/`** as a Space instead, use `.github/workflows/huggingface-deploy.yml` (optional repo variable `HF_SPACE_NEXUS_LITE` overrides the default Space name when not passed via the dispatch input). On the NAS, use `deploy/fnos/docker-compose.yml` + `deploy/fnos/.env.example` (copy to `.env`): bind-mount `./data` and `./sources`, enable Watchtower for automatic image pulls. Cloudflare Tunnel still needs a one-time token on the NAS; after that, day-to-day updates are push-to-Git only.

## Build, Test, and Development Commands
Run commands from each module directory unless noted.

- Frontend (`web`):
  - `bun install`
  - `bun run dev` (local dev server)
  - `bun run lint:check` / `bun run type-check`
  - `bun run test` / `bun run test:coverage`
- Rust backend (`api`):
  - `cargo check --workspace`
  - `cargo test --workspace --quiet`
- Workers (`edge`):
  - `npm ci`
  - `npm run type-check`
  - `npm run dev` / `npm run deploy`
  - Custom Pages/domain: set optional vars `CORS_EXTRA_ORIGINS` (comma-separated origins) and `PUBLIC_CONTENT_BASE_URL` (public URL for uploaded content links); defaults keep the legacy Pages behavior until the Nexus domain cutover. See `wrangler.toml` comments.
- Shared contracts (repo root):
  - `node scripts/validate-contracts.mjs`

## Coding Style & Naming Conventions
- TypeScript/Vue (`web`): Prettier + ESLint enforced.
  - 2-space indentation, single quotes, no semicolons, max line width 100.
  - Use `PascalCase.vue` for components and `camelCase` for variables/functions.
- Rust (`api`): use `cargo fmt`; follow `snake_case` for modules/functions and `PascalCase` for types.
- Keep modules cohesive; prefer extending existing feature folders over adding new top-level directories.

## Testing Guidelines
- Frontend tests use Vitest; place tests in `web/src/tests` and name as `*.test.ts`.
- Rust tests run via Cargo (`cargo test --workspace`), including module and integration tests.
- Workers include `npm run test` (optimization checks) and must pass `npm run type-check`.
- `.github/workflows/security-scan.yml`: on **pull requests**, CodeQL is skipped (dependency audits + custom `rg` checks only); full CodeQL runs on **weekly schedule** and **workflow_dispatch** (private repos: schedule still skips CodeQL per GitHub policy in this workflow).
- Run `node scripts/validate-contracts.mjs` for any API shape or route changes.

## Commit & Pull Request Guidelines
- Follow conventional commit style seen in history: `feat: ...`, `refactor: ...`, `ci: ...` (optional scope).
- Keep subject lines concise and imperative; one logical change per commit.
- PRs should include:
  - What changed and why.
  - Affected modules (for example: `web`, `edge`).
  - Validation evidence (commands run and results).
  - Screenshots for UI-visible changes.
