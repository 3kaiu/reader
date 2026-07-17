"""Configuration for the AI inference service."""

import os
from dataclasses import dataclass, field


@dataclass
class InferenceConfig:
    """Runtime configuration, loaded from environment variables."""

    # Inference backend: "ollama" | "mlx" | "llama_cpp"
    engine: str = field(default_factory=lambda: os.getenv("AI_ENGINE", "ollama"))

    # Ollama endpoint (used when engine == "ollama")
    ollama_url: str = field(default_factory=lambda: os.getenv("OLLAMA_URL", "http://localhost:11434"))

    # Model identifier
    model: str = field(default_factory=lambda: os.getenv("AI_MODEL", "qwen2.5:7b"))

    # MLX model path (used when engine == "mlx")
    mlx_model_path: str = field(default_factory=lambda: os.getenv("MLX_MODEL_PATH", ""))

    # Server
    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8001")))
    debug: bool = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")

    # Inference parameters
    max_tokens: int = field(default_factory=lambda: int(os.getenv("AI_MAX_TOKENS", "2048")))
    temperature: float = field(default_factory=lambda: float(os.getenv("AI_TEMPERATURE", "0.1")))

    @classmethod
    def from_env(cls) -> "InferenceConfig":
        return cls()
