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

## Legacy Modules (do not import in runtime path)

- `core/__init__.py`
- `core/config_manager.py`
- `core/domain.py`
- `core/interfaces.py`
- `core/middleware.py`
- `core/ml_engine.py`

## Policy

- These legacy modules are kept temporarily for staged cleanup.
- New runtime code must not import legacy modules.
- CI guard: `node scripts/cf-bypass-runtime-guard.mjs`.
- Planned cleanup target: after 2026-05-31, remove legacy modules with no runtime references.
