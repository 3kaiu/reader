# CF Bypass Service

FastAPI service used by the monorepo to fetch and extract HTML behind anti-bot protections.

## Runtime Scope

- Provides `/fetch`, `/fetch/batch`, `/extract`, `/health` and optional admin endpoints.
- Engines are selected via `core/engine_factory.py` (currently `scraper` and `mesh`).
- This service is an infrastructure dependency for `nexus-lite` fetching paths.

## Development

```bash
uvicorn main:app --reload --port 8000
```

## Notes

- `app.py` is only a compatibility entrypoint re-exporting `main:app`.
- Keep endpoint behavior stable for upstream callers in `nexus-lite` and workers.
