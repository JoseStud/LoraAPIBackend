#!/usr/bin/env python3
"""Run the checks that CI enforces locally in a single command."""

from __future__ import annotations

import subprocess
from typing import Sequence

COMMANDS: Sequence[Sequence[str]] = (
    ("ruff", "format", "--check", "."),
    ("ruff", "check", "."),
    ("pytest",),
    ("npm", "run", "lint"),
    ("npm", "run", "type-check"),
    ("npm", "run", "build"),
)


def run_command(command: Sequence[str]) -> None:
    """Execute a single command and stream its output."""
    print(f"\n→ {' '.join(command)}", flush=True)
    subprocess.run(command, check=True)


def main() -> int:
    """Run the CI-equivalent workflow and return the exit code."""
    for command in COMMANDS:
        run_command(command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
