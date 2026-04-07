# System Flow (Reader Monorepo)

This document defines the current end-to-end runtime flow and ownership boundaries.

## End-to-End Request Path

1. `nexus-reader` (frontend) issues API requests.
2. `cloudflare-workers` acts as edge gateway.
3. `nexus-lite` serves core reading APIs.
4. `cf-bypass-service` is used by backend fetch/runtime paths when bypass/extraction is needed.

## Core Read Path

- Search: `POST /api/search`
- Book info: `GET /api/book`
- Chapter list: `GET /api/chapters`
- Chapter content: `GET /api/content`

Route contracts are defined in `contracts/http-routes.json` and validated by `scripts/validate-contracts.mjs`.

## Runtime Ownership

- Frontend UX/API orchestration: `nexus-reader`
- Edge auth/proxy/decoder routing: `cloudflare-workers`
- Core source/search/content/bookshelf APIs: `nexus-lite`
- External anti-bot HTML fetch and extraction: `cf-bypass-service`

## Reliability Boundaries

- Primary edge entrypoint: `cloudflare-workers/entry.ts`
- Compatibility shim (deprecated): `cloudflare-workers/unified-worker.ts`
- Backend direct mode is controlled by frontend route policy and env vars:
  - `VITE_API_URL`
  - `VITE_NEXUS_LITE_DIRECT_URL`
  - `VITE_NEXUS_LITE_API_KEY`

## Operational Checks

- Route/API contract drift: `node scripts/validate-contracts.mjs`
- Repository hygiene drift: `node scripts/repo-hygiene-check.mjs`
- CF bypass runtime boundary drift: `node scripts/cf-bypass-runtime-guard.mjs`
- Dead-code/orphan hints (non-blocking report): `node scripts/dead-code-report.mjs`
