"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.router import router
from core.config import InferenceConfig
from engines.factory import create_engine


def create_app(config: InferenceConfig | None = None) -> FastAPI:
    if config is None:
        config = InferenceConfig.from_env()

    app = FastAPI(
        title="Nexus AI Inference",
        version="0.1.0",
        docs_url="/docs" if config.debug else None,
    )

    # Engine is created once and stored in app state
    engine = create_engine(config)
    app.state.engine = engine
    app.state.config = config

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    @app.on_event("shutdown")
    async def shutdown():
        if hasattr(engine, "close"):
            await engine.close()

    return app
