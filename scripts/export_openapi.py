#!/usr/bin/env python3
"""Write the backend's OpenAPI schema as JSON without starting a server.

``create_app()`` only builds the FastAPI app; the lifespan (migrations, model
preloading, job recovery) runs when a server starts it, so exporting the schema
touches no database, queue or GPU.

The output is deterministic: keys keep the order FastAPI emits (routes in
registration order, component schemas sorted by name, properties in model
declaration order), which depends only on the code, not on hash seeds or the
environment. Keeping declaration order, rather than sorting every key, keeps
the generated TypeScript fields in the same order as the Pydantic models.

Usage: ``python scripts/export_openapi.py <output.json>`` (``-`` for stdout).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def export_openapi() -> str:
    """Return the app's OpenAPI schema serialised as deterministic JSON."""
    from backend.main import create_app

    schema = create_app().openapi()
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    """Write the schema to the path given on the command line."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("output", help="Destination file, or '-' for stdout.")
    args = parser.parse_args(argv)

    payload = export_openapi()
    if args.output == "-":
        sys.stdout.write(payload)
    else:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
