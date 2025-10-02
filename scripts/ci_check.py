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
    ("npm", "run", "check:bundle"),
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

def _ensure_cancel_job_usage_is_guarded() -> None:
    """Ensure cancelGenerationJob is only used within the orchestrator manager surface."""

    allowed_files = {
        Path("app/frontend/src/features/generation/services/generationService.ts"),
        Path("app/frontend/src/features/generation/services/queueClient.ts"),
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


def _ensure_generation_stores_are_private() -> None:
    """Fail when generation stores are imported outside the feature boundary."""

    feature_root = Path("app/frontend/src/features/generation")
    forbidden_pattern = r"stores/(results|queue)"

    result = subprocess.run(
        (
            "rg",
            "--with-filename",
            "--line-number",
            "--no-heading",
            forbidden_pattern,
            "app/frontend/src",
        ),
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode not in (0, 1):
        raise RuntimeError("Failed to scan for generation store imports")

    matches = _parse_rg_output(result.stdout)

    def _is_inside_feature(path: Path) -> bool:
        try:
            path.relative_to(feature_root)
        except ValueError:
            return False
        return True

    violations: list[tuple[Path, str, str]] = []
    for path, line_no, content in matches:
        if not _is_inside_feature(path) and ("import" in content or "from" in content or "export" in content):
            violations.append((path, line_no, content))

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}" for path, line_no, content in violations
        )
        raise SystemExit(
            "Generation stores must not be imported directly outside the feature.\n"
            "Use the orchestrator facade instead:\n"
            f"{formatted}"
        )


def run_guardrail_checks() -> None:
    """Run repository guardrail validations prior to full CI checks."""

    _ensure_cancel_job_usage_is_guarded()
    _ensure_generation_stores_are_private()


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
