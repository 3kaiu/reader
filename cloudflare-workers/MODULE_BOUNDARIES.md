# Cloudflare Worker Module Boundaries

This document defines the current module ownership and allowed dependencies.

## Runtime request path

1. `entry.ts` is the only runtime entrypoint configured in `wrangler.toml`.
2. `worker/edge-gateway.ts` owns edge concerns only (auth, path routing, proxy forwarding).
3. `worker/user-services.ts` owns user-facing add-on services (analytics, preferences, upload, backup).
4. `worker/*` also contains env validation, route handlers, and runtime systems.
5. `shared/*` contains reusable cross-cutting utilities (auth, proxy, cache, logger, cors, types).

## Compatibility path

- `unified-worker.ts` is a compatibility shim that re-exports `entry.ts`.
- No new logic should be added to `unified-worker.ts`.

## Experimental path

- `src/*` is an experimental optimization layer.
- Files in `src/*` must not assume a specific entry file.
- Runtime behavior from `src/*` must be injected explicitly (for example, via a dispatcher callback).
- `src/entry-adapter.ts` is the only bridge that entry code may import from `src/*`.
- `src/entry-adapter.ts` must gate experiments by route allowlist and rollout percentage.

## Dependency rules

- `entry.ts` may import from `worker/*`, `shared/*`, and `src/entry-adapter.ts`.
- `worker/*` may import from `shared/*`.
- `shared/*` must not import from `worker/*` or `src/*`.
- `src/*` may use `shared/*` but must not depend on `entry.ts` or `worker/*` internals.

## Change guardrails

- New API route handlers go in `worker/routes.ts`.
- Route ownership must be explicit in `worker/edge-gateway.ts` or `worker/user-services.ts`.
- New runtime services go in `worker/systems.ts`.
- New common helpers go in `shared/*`.
- If a feature is experimental-only, keep it in `src/*` and wire it by explicit adapter/injection.
