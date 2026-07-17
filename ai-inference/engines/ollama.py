"""Ollama HTTP backend."""

from typing import Any

import httpx

from engines.base import BaseInferenceEngine


class OllamaEngine(BaseInferenceEngine):
    """Inference via Ollama's HTTP API.

    Works in both dev (localhost) and NAS (remote Ollama) deployments.
    """

    def __init__(self, base_url: str, model: str, **defaults: Any):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.defaults = defaults
        self._client = httpx.AsyncClient(timeout=120.0)

    async def infer(
        self,
        system: str,
        prompt: str,
        **kwargs: Any,
    ) -> str:
        params = {
            "model": self.model,
            "system": system,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", self.defaults.get("temperature", 0.1)),
                "num_predict": kwargs.get("max_tokens", self.defaults.get("max_tokens", 2048)),
            },
        }

        resp = await self._client.post(f"{self.base_url}/api/generate", json=params)
        resp.raise_for_status()
        data = resp.json()

        return data.get("response", "")

    async def close(self) -> None:
        await self._client.aclose()
