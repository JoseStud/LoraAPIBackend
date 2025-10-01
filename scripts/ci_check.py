#!/usr/bin/env python3
"""Run the checks that CI enforces locally in a single command."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Sequence

COMMANDS: Sequence[Sequence[str]] = (
    ("ruff", "format", "--check", "."),
    ("ruff", "check", "."),
    ("pytest",),
    ("npm", "run", "lint"),
    ("npm", "run", "build"),
)


def _parse_rg_output(output: str) -> list[tuple[Path, str, str]]:
    """Parse ripgrep output into structured tuples."""

    matches: list[tuple[Path, str, str]] = []
    for line in output.splitlines():
        if not line:
            continue
        parts = line.split(":", 2)
        if len(parts) != 3:
            continue
        path_str, line_no, content = parts
        matches.append((Path(path_str), line_no, content))
    return matches


def _ensure_generation_studio_imports_are_scoped() -> None:
    """Fail if GenerationStudio.vue is imported outside the public barrels."""

    allowed_files = {
        Path("app/frontend/src/features/generation/components/index.ts"),
        Path("app/frontend/src/features/generation/public.ts"),
    }

    result = subprocess.run(
        (
            "rg",
            "--with-filename",
            "--line-number",
            "--no-heading",
            "GenerationStudio\\.vue",
            "app/frontend/src",
        ),
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode not in (0, 1):
        raise RuntimeError("Failed to scan for GenerationStudio.vue imports")

    matches = _parse_rg_output(result.stdout)
    violations = [
        (path, line_no, content)
        for path, line_no, content in matches
        if path not in allowed_files
    ]

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}" for path, line_no, content in violations
        )
        raise SystemExit(
            "GenerationStudio.vue may only be imported via the feature barrel.\n"
            f"Remove the direct import(s):\n{formatted}"
        )


def _ensure_cancel_job_usage_is_guarded() -> None:
    """Ensure cancelGenerationJob is only used within the orchestrator manager surface."""

    allowed_files = {
        Path("app/frontend/src/features/generation/services/generationService.ts"),
        Path("app/frontend/src/features/generation/services/queueClient.ts"),
        Path("app/frontend/src/features/generation/composables/useJobQueueActions.ts"),
    }

    result = subprocess.run(
        (
            "rg",
            "--with-filename",
            "--line-number",
            "--no-heading",
            "cancelGenerationJob",
            "app/frontend/src",
        ),
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode not in (0, 1):
        raise RuntimeError("Failed to scan for cancelGenerationJob usage")

    matches = _parse_rg_output(result.stdout)
    violations = [
        (path, line_no, content)
        for path, line_no, content in matches
        if path not in allowed_files
    ]

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}" for path, line_no, content in violations
        )
        raise SystemExit(
            "cancelGenerationJob should only be invoked through the orchestrator manager surface.\n"
            f"Update the following file(s) to delegate through the manager:\n{formatted}"
        )


def run_guardrail_checks() -> None:
    """Run repository guardrail validations prior to full CI checks."""

    _ensure_generation_studio_imports_are_scoped()
    _ensure_cancel_job_usage_is_guarded()


def run_command(command: Sequence[str]) -> None:
    """Execute a single command and stream its output."""
    print(f"\n→ {' '.join(command)}", flush=True)
    subprocess.run(command, check=True)


def main() -> int:
    """Run the CI-equivalent workflow and return the exit code."""
    run_guardrail_checks()
    for command in COMMANDS:
        run_command(command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
