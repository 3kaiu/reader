"""Abstract base for all inference backends."""

from abc import ABC, abstractmethod
from typing import Any


class BaseInferenceEngine(ABC):
    """Pluggable inference backend.

    Implementations: OllamaEngine, MLXEngine, LlamaCppEngine.
    """

    @abstractmethod
    async def infer(
        self,
        system: str,
        prompt: str,
        **kwargs: Any,
    ) -> str:
        """Run inference and return the raw text response."""
        ...
