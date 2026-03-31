# Repository Guidelines

## Project Structure & Module Organization
This repository is a multi-service monorepo.

- `nexus-reader/`: Vue 3 + TypeScript frontend (`src/`, `public/`, `scripts/`, `src/tests/`).
- `nexus-lite/`: Rust workspace (`nexus-core`, `nexus-engine`, `nexus-storage`, `nexus-server`).
- `cloudflare-workers/`: Cloudflare Worker code and shared edge modules.
- `cf-bypass-service/`: Python FastAPI service for bypass-related backend logic.
- `contracts/`: Shared API/route contracts (used by frontend and workers).
- `scripts/validate-contracts.mjs`: Cross-module contract validator used in CI.

## Build, Test, and Development Commands
Run commands from each module directory unless noted.

- Frontend (`nexus-reader`):
  - `bun install`
  - `bun run dev` (local dev server)
  - `bun run lint:check` / `bun run type-check`
  - `bun run test` / `bun run test:coverage`
- Rust backend (`nexus-lite`):
  - `cargo check --workspace`
  - `cargo test --workspace --quiet`
- Workers (`cloudflare-workers`):
  - `npm ci`
  - `npm run type-check`
  - `npm run dev` / `npm run deploy`
- Shared contracts (repo root):
  - `node scripts/validate-contracts.mjs`

## Coding Style & Naming Conventions
- TypeScript/Vue (`nexus-reader`): Prettier + ESLint enforced.
  - 2-space indentation, single quotes, no semicolons, max line width 100.
  - Use `PascalCase.vue` for components and `camelCase` for variables/functions.
- Rust (`nexus-lite`): use `cargo fmt`; follow `snake_case` for modules/functions and `PascalCase` for types.
- Keep modules cohesive; prefer extending existing feature folders over adding new top-level directories.

## Testing Guidelines
- Frontend tests use Vitest; place tests in `nexus-reader/src/tests` and name as `*.test.ts`.
- Rust tests run via Cargo (`cargo test --workspace`), including module and integration tests.
- Workers include `npm run test` (optimization checks) and must pass `npm run type-check`.
- Run `node scripts/validate-contracts.mjs` for any API shape or route changes.

## Commit & Pull Request Guidelines
- Follow conventional commit style seen in history: `feat: ...`, `refactor: ...`, `ci: ...` (optional scope).
- Keep subject lines concise and imperative; one logical change per commit.
- PRs should include:
  - What changed and why.
  - Affected modules (for example: `nexus-reader`, `cloudflare-workers`).
  - Validation evidence (commands run and results).
  - Screenshots for UI-visible changes.
