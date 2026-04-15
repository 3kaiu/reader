# Legacy Modules (CF Bypass Service)

This document marks historical modules that are no longer part of the active runtime chain.

## Active Runtime Chain

- `main.py`
- `app.py`
- `config.py`
- `core/engine.py`
- `core/engine_factory.py`
- `core/errors.py`
- `core/utils.py`
- `engines/*`
- `managers/*`

## Removed Legacy Modules (must not be reintroduced)

- `core/config_manager.py`
- `core/domain.py`
- `core/interfaces.py`
- `core/middleware.py`
- `core/ml_engine.py`

## Policy

- These modules have been removed after confirming no runtime references.
- New runtime code must not reintroduce imports to these module paths.
- CI guard: `node scripts/cf-bypass-runtime-guard.mjs`.
