# Cloudflare Worker Module Boundaries

This document defines the current module ownership and allowed dependencies for the personal Reader project.

## Runtime request path

1. `entry.ts` is the runtime entrypoint configured in `wrangler.toml`.
2. `worker/edge-gateway.ts` owns edge concerns only (auth, proxy forwarding).
3. `worker/user-services.ts` owns user-facing add-on services (preferences, upload, backup, ai-assist).
4. `worker/*` also contains env validation, route handlers, and runtime systems.
5. `shared/*` contains reusable cross-cutting utilities (auth, proxy, logger, cors, types).

## Dependency rules

- `entry.ts` may import from `worker/*` and `shared/*`.
- `worker/*` may import from `shared/*`.
- `shared/*` must not import from `worker/*`.

## Change guardrails

- New API route handlers go in `worker/routes.ts` or directly in `worker/routes/`.
- Route ownership must be explicit in `worker/edge-gateway.ts` or `worker/user-services/routing.ts`.
- New runtime services go in `worker/systems.ts`.
- New common helpers go in `shared/*`.
