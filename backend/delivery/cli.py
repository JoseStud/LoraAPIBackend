"""CLI delivery implementation."""

import os
import tempfile
from typing import Any, Dict

from .base import DeliveryBackend


class CLIDeliveryBackend(DeliveryBackend):
    """CLI delivery backend implementation."""

    async def deliver(self, prompt: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Deliver prompt via CLI (write to temp file).

        Args:
            prompt: The composed prompt
            params: CLI parameters (template, etc.)

        Returns:
            Dict with delivery result

        """
        template = params.get("template")

        try:
            # Create temporary file
            fd, path = tempfile.mkstemp(prefix="lora_prompt_", suffix=".txt", text=True)

            with os.fdopen(fd, "w") as f:
                if template:
                    # Apply template if provided
                    formatted_prompt = template.format(prompt=prompt)
                    f.write(formatted_prompt)
                else:
                    f.write(prompt)

            return {
                "status": "ok",
                "detail": f"Prompt written to {path}",
                "file_path": path,
            }
        except Exception as exc:
            return {"status": "error", "detail": str(exc)}

    def get_backend_name(self) -> str:
        """Return backend name."""
        return "cli"
