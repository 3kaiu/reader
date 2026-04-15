# CF Bypass Service

FastAPI service used by the monorepo to fetch and extract HTML behind anti-bot protections.

## Runtime Scope

- Provides `/fetch` and `/health` only.
- Engines are selected via `core/engine_factory.py` (currently `scraper`).
- This service is an infrastructure dependency for the Nexus API fetching paths.

## Development

```bash
uvicorn main:app --reload --port 8000
```

## Notes

- Keep endpoint behavior stable for upstream callers in the Nexus API and workers.
