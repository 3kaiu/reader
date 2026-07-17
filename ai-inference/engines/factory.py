"""Inference engine factory."""

from engines.base import BaseInferenceEngine
from engines.ollama import OllamaEngine
from core.config import InferenceConfig


def create_engine(config: InferenceConfig) -> BaseInferenceEngine:
    """Create inference engine based on config.engine value.

    Supported backends:
      - "ollama": Ollama HTTP API (default, works anywhere)
      - "mlx": Apple MLX (macOS dev only, requires mlx-lm)
      - "llama_cpp": llama.cpp server (NAS CPU)
    """
    if config.engine == "ollama":
        return OllamaEngine(
            base_url=config.ollama_url,
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
    elif config.engine == "mlx":
        from engines.mlx import MLXEngine  # lazy import
        return MLXEngine(
            model_path=config.mlx_model_path,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
    elif config.engine == "llama_cpp":
        # TODO V2: implement LlamaCppEngine
        raise NotImplementedError("llama_cpp engine not yet implemented")
    else:
        raise ValueError(f"Unknown engine: {config.engine}")
