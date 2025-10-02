#!/usr/bin/env python3
"""Run the checks that CI enforces locally in a single command."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
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


def _search_repository(
    pattern: str, search_root: Path, *, use_regex: bool
) -> list[tuple[Path, str, str]]:
    """Search the repository for the given pattern.

    Prefer ripgrep when available for parity with CI, but fall back to a Python
    implementation when `rg` is missing (e.g., in constrained environments).
    """
    if shutil.which("rg"):
        args = [
            "rg",
            "--with-filename",
            "--line-number",
            "--no-heading",
        ]
        if not use_regex:
            args.append("-F")
        args.extend([pattern, str(search_root)])

        result = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
        )

        if result.returncode not in (0, 1):
            raise RuntimeError("Failed to scan for pattern using ripgrep")

        return _parse_rg_output(result.stdout)

    compiled_regex = re.compile(pattern) if use_regex else None
    matches: list[tuple[Path, str, str]] = []
    for path in search_root.rglob("*"):
        if not path.is_file():
            continue
        try:
            contents = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        for line_no, line in enumerate(contents.splitlines(), start=1):
            if use_regex:
                if compiled_regex.search(line):
                    matches.append((path, str(line_no), line))
            elif pattern in line:
                matches.append((path, str(line_no), line))

    return matches


def _ensure_cancel_job_usage_is_guarded() -> None:
    """Ensure cancelGenerationJob goes through the orchestrator manager surface."""
    allowed_files = {
        Path("app/frontend/src/features/generation/services/generationService.ts"),
        Path("app/frontend/src/features/generation/services/queueClient.ts"),
    }

    matches = _search_repository(
        "cancelGenerationJob", Path("app/frontend/src"), use_regex=False
    )
    violations = [
        (path, line_no, content)
        for path, line_no, content in matches
        if path not in allowed_files
    ]

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}"
            for path, line_no, content in violations
        )
        raise SystemExit(
            "cancelGenerationJob should only be invoked through the orchestrator "
            "manager surface.\n"
            "Update the following file(s) to delegate through the manager:\n"
            f"{formatted}"
        )


def _ensure_generation_stores_are_private() -> None:
    """Fail when generation stores are imported outside the feature boundary."""
    feature_root = Path("app/frontend/src/features/generation")
    forbidden_pattern = r"stores/(results|queue)"

    matches = _search_repository(
        forbidden_pattern, Path("app/frontend/src"), use_regex=True
    )

    def _is_inside_feature(path: Path) -> bool:
        try:
            path.relative_to(feature_root)
        except ValueError:
            return False
        return True

    violations: list[tuple[Path, str, str]] = []
    for path, line_no, content in matches:
        if not _is_inside_feature(path) and (
            "import" in content or "from" in content or "export" in content
        ):
            violations.append((path, line_no, content))

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}"
            for path, line_no, content in violations
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
    _ensure_no_legacy_frontend_paths()
    _ensure_no_deep_feature_imports()
    _run_guardrail_fitness_tests()


def _ensure_no_legacy_frontend_paths() -> None:
    """Ensure legacy component or provider paths do not reappear."""
    checks: Sequence[tuple[str, bool, str]] = (
        (
            "@/components/import-export",
            False,
            (
                "Import/export modules should be consumed via "
                '"@/features/import-export/public".'
            ),
        ),
        (
            r"GenerationStudio\.vue",
            True,
            (
                "GenerationStudio.vue was removed. Use the generation shell "
                "feature instead."
            ),
        ),
        (
            "@/providers",
            False,
            "Legacy providers are deprecated. Prefer feature-managed providers.",
        ),
    )

    violations: list[str] = []
    for pattern, use_regex, message in checks:
        matches = _search_repository(
            pattern, Path("app/frontend/src"), use_regex=use_regex
        )
        if not matches:
            continue

        formatted_matches = "\n".join(
            f"- {path}:{line_no}: {content.strip()}"
            for path, line_no, content in matches
        )
        violations.append(f"{message}\n{formatted_matches}")

    if violations:
        raise SystemExit(
            "Legacy frontend paths detected. Clean up the following occurrences:\n"
            + "\n\n".join(violations)
        )


def _ensure_no_deep_feature_imports() -> None:
    """Block importing feature internals across feature boundaries."""
    search_root = Path("app/frontend/src")
    feature_root = Path("app/frontend/src/features")
    if not feature_root.exists():
        return
    pattern = r"@/features/([^/'\"]+)/([^'\"]+)"

    matches = _search_repository(pattern, search_root, use_regex=True)

    violations: list[tuple[Path, str, str]] = []

    feature_dirs = {entry.name for entry in feature_root.iterdir() if entry.is_dir()}

    for path, line_no, content in matches:
        match = re.search(pattern, content)
        if not match:
            continue

        feature_name, internal_path = match.groups()

        if feature_name not in feature_dirs:
            continue

        if internal_path.startswith("public"):
            continue

        try:
            path.relative_to(feature_root / feature_name)
            continue
        except ValueError:
            violations.append((path, line_no, content))

    if violations:
        formatted = "\n".join(
            f"- {path}:{line_no}: {content.strip()}"
            for path, line_no, content in violations
        )
        raise SystemExit(
            "Feature internals must remain private. Import feature surfaces via their "
            f"public barrels:\n{formatted}"
        )


def _run_guardrail_fitness_tests() -> None:
    """Lint fixtures that should fail to verify guardrail rules are active."""
    fixtures = [
        Path("tests/guardrails/forbidden_feature_internal.ts"),
        Path("tests/guardrails/forbidden_backend_client.ts"),
        Path("tests/guardrails/forbidden_request_configured_json.ts"),
    ]

    eslint_command = ["npx", "eslint", "--no-ignore"]

    for fixture in fixtures:
        if not fixture.exists():
            raise SystemExit(f"Guardrail fixture missing: {fixture}")

        result = subprocess.run(
            [*eslint_command, str(fixture)],
            check=False,
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            print(result.stdout)
            print(result.stderr, file=sys.stderr)
            raise SystemExit(
                "Guardrail fitness test succeeded unexpectedly for "
                f"{fixture}. Ensure the ESLint rule fails."
            )


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
