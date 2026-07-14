# ADR 001: Monorepo with Contract-Driven Development

## Status
Accepted

## Context
The Nexus Reader project is a multi-service monorepo consisting of:
- **web**: Vue 3 SPA frontend
- **api**: Rust backend (nexus-core, nexus-engine, nexus-storage, nexus-server)
- **edge**: Cloudflare Worker for proxy/caching
- **bypass**: Python FastAPI service for Cloudflare bypass
- **contracts**: Shared HTTP route contracts

Each service is independently deployable but shares a common contract for API routes.

## Decision
We will use a monorepo with contract-driven development:
1. All HTTP routes are defined in `contracts/http-routes.json`
2. Contract validation runs in CI (`node scripts/validate-contracts.mjs`)
3. TypeScript constants are generated from contracts (`scripts/generate-http-route-constants.mjs`)
4. Rust backend routes are validated against the contract

## Consequences
**Positive:**
- Single source of truth for API routes
- Breaking changes detected in CI
- Frontend/Backend/Worker stay in sync automatically
- Type-safe route constants in frontend

**Negative:**
- Additional CI step for contract validation
- Need to regenerate constants when contracts change
- Contract changes require coordinated updates across services

## Implementation Details
- Contract file: `contracts/http-routes.json`
- Validation script: `scripts/validate-contracts.mjs`
- Generation script: `scripts/generate-http-route-constants.mjs`
- CI job: `.github/workflows/ci.yml` -> `validate-contracts` job