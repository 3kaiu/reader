"""MLX backend for macOS development.

Requires: mlx-lm (pip install mlx-lm)
Uses Apple Silicon GPU via MLX framework.
"""

from typing import Any

from engines.base import BaseInferenceEngine


class MLXEngine(BaseInferenceEngine):
    """Inference via Apple MLX on macOS.

    Not available on NAS (Docker) — only for M-series Mac development.
    """

    def __init__(self, model_path: str, **defaults: Any):
        if not model_path:
            raise ValueError("MLX model path is required")
        self.model_path = model_path
        self.defaults = defaults
        self._model = None
        self._tokenizer = None

    async def infer(self, system: str, prompt: str, **kwargs: Any) -> str:
        # Lazily import mlx-lm (dependency is optional on non-macOS platforms)
        try:
            import mlx_lm
            from mlx_lm import generate, load
        except ImportError:
            raise RuntimeError("mlx-lm not installed. Run: pip install mlx-lm")

        if self._model is None:
            self._model, self._tokenizer = load(self.model_path)

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = generate(
            self._model,
            self._tokenizer,
            messages=messages,
            max_tokens=kwargs.get("max_tokens", self.defaults.get("max_tokens", 2048)),
            temperature=kwargs.get("temperature", self.defaults.get("temperature", 0.1)),
        )

        return response
