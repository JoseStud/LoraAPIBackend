"""CLI delivery implementation."""

import os
import tempfile
from typing import Any, Dict

from backend.core.logging import get_logger

from .base import DeliveryBackend

logger = get_logger(__name__)


class CLIDeliveryBackend(DeliveryBackend):
    """CLI delivery backend implementation."""

    async def deliver(self, prompt: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Deliver prompt via CLI (write to temp file).

        Args:
            prompt: The composed prompt
            params: CLI parameters. ``template`` is an optional string in which
                every literal ``{prompt}`` is replaced by the prompt. It is not a
                ``str.format`` template: other braces, format specs and
                attribute lookups such as ``{prompt.__class__}`` are written
                unchanged.

        Returns:
            Dict with delivery result

        """
        template = params.get("template")

        try:
            # Create temporary file
            fd, path = tempfile.mkstemp(prefix="lora_prompt_", suffix=".txt", text=True)

            with os.fdopen(fd, "w") as f:
                if template:
                    f.write(str(template).replace("{prompt}", prompt))
                else:
                    f.write(prompt)

            return {
                "status": "ok",
                "detail": f"Prompt written to {path}",
                "file_path": path,
            }
        except Exception:
            logger.exception("CLI delivery failed")
            return {"status": "error", "detail": "Failed to write prompt file"}

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "cli"
