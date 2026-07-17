"""AI inference service entry point.

Provides HTTP endpoints for Nexus Reader's AI Decoder subsystem.
Deployed as a sidecar container alongside nexus-server.
"""

from core.app import create_app

app = create_app()
