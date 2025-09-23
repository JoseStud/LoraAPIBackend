"""Simple importer that polls a directory for Civitai-style JSON metadata
and registers LoRA adapters using the application's service layer.

This is intentionally minimal for local testing. It supports a `--dry-run`
mode to print the actions it would take without touching the DB.
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from fnmatch import fnmatch
from typing import Any, Dict, List, Optional

# Add parent directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.core.config import settings
from backend.core.database import get_session_context
from backend.services import get_service_container_builder
from backend.services.adapters import AdapterService
from backend.services.analytics_repository import AnalyticsRepository

logger = logging.getLogger("lora.importer")


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


@dataclass
class ParsedMetadata:
    """Parsed metadata from Civitai JSON."""

    name: str
    version: Optional[str]
    tags: list
    file_path: str
    weight: Optional[float]
    extra: Dict[str, Any]


def parse_civitai_json(json_path: str) -> ParsedMetadata:
    """Parse a Civitai-style JSON file into ParsedMetadata.

    This function extracts comprehensive metadata from Civitai JSON and
    places unknown keys into `extra`.
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Core fields
    name = data.get("name") or os.path.splitext(os.path.basename(json_path))[0]
    version = None
    description = data.get("description")
    author_username = None
    published_at = None
    trained_words = []
    primary_file_name = None
    primary_file_sha256 = None
    primary_file_download_url = None
    primary_file_size_kb = None
    supports_generation = data.get("supportsGeneration", False)
    sd_version = data.get("sd version")
    nsfw_level = data.get("nsfwLevel", 0)
    activation_text = data.get("activation text")
    stats = data.get("stats")
    
    # Extract version, trained words, and file info from modelVersions
    model_versions = data.get("modelVersions", [])
    if model_versions:
        first_version = model_versions[0]
        version = first_version.get("name") or data.get("version")
        published_at = first_version.get("publishedAt")
        trained_words = first_version.get("trainedWords", [])
        
        # Extract primary file info
        files = first_version.get("files", [])
        primary_file = None
        for f in files:
            if f.get("primary", False):
                primary_file = f
                break
        if not primary_file and files:
            # Fallback to largest file
            primary_file = max(files, key=lambda x: x.get("sizeKB", 0))
        
        if primary_file:
            primary_file_name = primary_file.get("name")
            primary_file_size_kb = primary_file.get("sizeKB")
            primary_file_download_url = primary_file.get("downloadUrl")
            hashes = primary_file.get("hashes", {})
            primary_file_sha256 = hashes.get("SHA256")
    else:
        # Fallback to top-level version if no modelVersions
        version = data.get("version")

    # Extract author info
    creator = data.get("creator", {})
    if creator:
        author_username = creator.get("username")

    # Tags
    tags = data.get("tags", [])
    weight = data.get("weight") or data.get("default_weight")

    # Determine model file path by looking for files with same basename 
    # and known extensions
    base = os.path.splitext(json_path)[0]
    candidate = None
    if primary_file_name:
        # Try to find the file with the exact name from JSON
        candidate_with_name = os.path.join(
            os.path.dirname(json_path), primary_file_name,
        )
        if os.path.exists(candidate_with_name):
            candidate = candidate_with_name
    
    if not candidate:
        # Fallback: look for files with same basename
        for ext in (".safetensors", ".pt", ".bin", ".ckpt"):
            p = base + ext
            if os.path.exists(p):
                candidate = p
                break

    # Final fallback: assume the model lives next to JSON
    if not candidate:
        candidate = base + ".safetensors"

    # Store everything we didn't explicitly map
    mapped_keys = {
        "name", "version", "description", "creator", "tags", "weight", "default_weight",
        "modelVersions", "supportsGeneration", "sd version", "nsfwLevel", 
        "activation text", "stats",
    }
    extra = {k: v for k, v in data.items() if k not in mapped_keys}

    return ParsedMetadata(
        name=name,
        version=version,
        tags=tags,
        file_path=candidate,
        weight=weight,
        extra={
            "description": description,
            "author_username": author_username,
            "published_at": published_at,
            "trained_words": trained_words,
            "primary_file_name": primary_file_name,
            "primary_file_sha256": primary_file_sha256,
            "primary_file_download_url": primary_file_download_url,
            "primary_file_size_kb": primary_file_size_kb,
            "supports_generation": supports_generation,
            "sd_version": sd_version,
            "nsfw_level": nsfw_level,
            "activation_text": activation_text,
            "stats": stats,
            "unmapped": extra,
        },
    )


def _should_ignore(path: str, import_root: str, patterns: Optional[List[str]]) -> bool:
    """Return True if `path` matches any ignore pattern."""
    if not patterns:
        return False

    rel_path = os.path.relpath(path, import_root)
    # Normalise path separators for consistent glob matching
    rel_path_normalised = rel_path.replace(os.sep, "/")
    full_path_normalised = path.replace(os.sep, "/")

    for pattern in patterns:
        if fnmatch(rel_path, pattern) or fnmatch(rel_path_normalised, pattern):
            return True
        if fnmatch(path, pattern) or fnmatch(full_path_normalised, pattern):
            return True
    return False


def discover_metadata(import_path: str, ignore_patterns: Optional[List[str]] = None):
    """Yield JSON metadata files found under `import_path` recursively."""
    for root, dirs, files in os.walk(import_path):
        # Prune ignored directories early to avoid descending into them
        dirs[:] = [
            d
            for d in dirs
            if not _should_ignore(os.path.join(root, d), import_path, ignore_patterns)
        ]
        for fn in files:
            if fn.lower().endswith(".json"):
                full_path = os.path.join(root, fn)
                if _should_ignore(full_path, import_path, ignore_patterns):
                    continue
                yield full_path


def discover_orphan_safetensors(
    import_path: str, ignore_patterns: Optional[List[str]] = None,
) -> List[str]:
    """Return safetensor files that do not have a matching JSON metadata file."""
    orphans: List[str] = []
    for root, dirs, files in os.walk(import_path):
        dirs[:] = [
            d
            for d in dirs
            if not _should_ignore(os.path.join(root, d), import_path, ignore_patterns)
        ]
        json_basenames = {
            os.path.splitext(fn)[0].lower() for fn in files if fn.lower().endswith(".json")
        }
        for fn in files:
            if not fn.lower().endswith(".safetensors"):
                continue
            basename = os.path.splitext(fn)[0].lower()
            if basename not in json_basenames:
                full_path = os.path.join(root, fn)
                if _should_ignore(full_path, import_path, ignore_patterns):
                    continue
                orphans.append(full_path)
    return sorted(orphans)


def register_adapter_from_metadata(
    parsed: ParsedMetadata, 
    json_path: Optional[str] = None, 
    dry_run: bool = True,
):
    """Register parsed metadata; returns a result dict describing the action.

    In dry-run mode this does not persist anything and returns a dict with
    the payload and an action hint so callers can build a summary.
    """
    # Build comprehensive payload from parsed metadata
    extra_data = parsed.extra or {}
    # Ensure numeric file size is an int. Civitai JSON sometimes uses floats
    # (e.g. 223109.61328125) which Pydantic rejects for int fields. Round
    # to nearest integer to preserve expected semantics and avoid validation
    # errors (see pydantic int_from_float).
    pfs = extra_data.get("primary_file_size_kb")
    if pfs is not None:
        try:
            extra_data["primary_file_size_kb"] = int(round(float(pfs)))
        except Exception:
            # If conversion fails, leave the value and let validation catch it
            pass
    
    # Get file metadata for tracking
    json_file_mtime = None
    json_file_size = None
    if json_path and os.path.exists(json_path):
        stat = os.stat(json_path)
        json_file_mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        json_file_size = stat.st_size
    
    payload = {
        "name": parsed.name,
        "version": parsed.version,
        "tags": parsed.tags,
        "file_path": parsed.file_path,
        "weight": parsed.weight,
        # New comprehensive fields
        "description": extra_data.get("description"),
        "author_username": extra_data.get("author_username"),
        "published_at": extra_data.get("published_at"),
        "trained_words": extra_data.get("trained_words", []),
        "primary_file_name": extra_data.get("primary_file_name"),
        "primary_file_sha256": extra_data.get("primary_file_sha256"),
        "primary_file_download_url": extra_data.get("primary_file_download_url"),
        "primary_file_size_kb": extra_data.get("primary_file_size_kb"),
        "supports_generation": extra_data.get("supports_generation", False),
        "sd_version": extra_data.get("sd_version"),
        "nsfw_level": extra_data.get("nsfw_level", 0),
        "activation_text": extra_data.get("activation_text"),
        "stats": extra_data.get("stats"),
        "extra": extra_data.get("unmapped"),
        # Ingestion tracking
        "json_file_path": json_path,
        "json_file_mtime": json_file_mtime,
        "json_file_size": json_file_size,
        "last_ingested_at": datetime.now(timezone.utc),
    }

    result = {"json": json_path, "payload": payload, "status": None, "error": None}

    if dry_run:
        logger.info("DRY RUN - would register: %s", payload)
        result["status"] = "would_register"
        return result

    # persist using service-level upsert helper (idempotent)
    from backend.schemas.adapters import AdapterCreate

    # validate file exists before attempting to persist
    with get_session_context() as validation_session:
        svc = AdapterService(validation_session)
        file_is_valid = svc.validate_file_path(parsed.file_path)

    if not file_is_valid:
        msg = f"File does not exist or is not readable: {parsed.file_path}"
        logger.error(msg)
        result["status"] = "missing_file"
        result["error"] = msg
        return result

    ac = AdapterCreate(**{k: v for k, v in payload.items() if v is not None})
    try:
        with get_session_context() as session:
            services = get_service_container_builder().build(
                session,
                analytics_repository=AnalyticsRepository(session),
                recommendation_gpu_available=False,
            )
            adapter = services.domain.adapters.upsert_adapter(ac)
        logger.info("Upserted adapter %s (id=%s)", adapter.name, adapter.id)
        result["status"] = "upserted"
        result["id"] = adapter.id
        return result
    except Exception as exc:
        logger.exception("Failed to upsert adapter from %s: %s", json_path, exc)
        result["status"] = "error"
        result["error"] = str(exc)
        return result


def needs_resync(json_path: str, force_resync: bool = False) -> bool:
    """Check if a JSON file needs to be reprocessed based on modification time."""
    if force_resync:
        return True
    
    if not os.path.exists(json_path):
        return False
        
    # Check if we have existing record for this file
    session = get_session_context()
    
    try:
        # Import Adapter model to query directly
        from sqlmodel import select

        from backend.models import Adapter
        
        # Look for existing adapter with this json_file_path
        statement = select(Adapter).where(Adapter.json_file_path == json_path)
        existing = session.exec(statement).first()
        
        if not existing:
            return True  # New file, needs processing
            
        if not existing.json_file_mtime:
            return True  # No tracking data, needs processing
            
        # Compare file modification time
        stat = os.stat(json_path)
        file_mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        existing_mtime = existing.json_file_mtime

        if existing_mtime.tzinfo is None:
            existing_mtime = existing_mtime.replace(tzinfo=timezone.utc)
        if file_mtime.tzinfo is None:
            file_mtime = file_mtime.replace(tzinfo=timezone.utc)

        return file_mtime > existing_mtime
        
    except Exception as e:
        logger.warning("Error checking resync status for %s: %s", json_path, e)
        return True  # If in doubt, process it
    finally:
        session.close()


def run_one_shot_import(
    import_path: str,
    dry_run: bool = False,
    force_resync: bool = False,
    ignore_patterns: Optional[List[str]] = None,
):
    """Process the import directory once and return a summary."""
    results: List[Dict[str, Any]] = []
    processed = 0
    skipped = 0
    errors = 0

    for jpath in discover_metadata(import_path, ignore_patterns):
        needs_processing = force_resync or needs_resync(jpath)

        if not dry_run and not needs_processing:
            skipped += 1
            continue

        try:
            parsed = parse_civitai_json(jpath)
            res = register_adapter_from_metadata(
                parsed,
                json_path=jpath,
                dry_run=dry_run,
            )
            status = res.get("status")

            if dry_run and not needs_processing:
                res["status"] = "would_skip_no_changes"
                skipped += 1
            elif not dry_run and not needs_processing:
                skipped += 1

            if needs_processing and status in {"upserted", "would_register"}:
                processed += 1
            elif status in {"missing_file", "error"}:
                errors += 1

            results.append(res)
        except Exception as exc:  # pragma: no cover - defensive guard for CLI usage
            logger.exception("Failed to process %s: %s", jpath, exc)
            results.append({"json": jpath, "status": "error", "error": str(exc)})
            errors += 1

    orphans = discover_orphan_safetensors(import_path, ignore_patterns)

    summary = {
        "total": len(results),
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "results": results,
        "safetensors_without_metadata": orphans,
    }

    return summary


def run_poller(
    import_path: str, 
    poll_seconds: int, 
    dry_run: bool, 
    force_resync: bool = False,
    ignore_patterns: Optional[List[str]] = None,
):
    """Run the import poller to process JSON files."""
    seen = set()
    # Dry-run mode: perform a single pass and emit a JSON summary then exit.
    if dry_run:
        summary = run_one_shot_import(
            import_path,
            dry_run=True,
            force_resync=force_resync,
            ignore_patterns=ignore_patterns,
        )
        # Print JSON summary to stdout for consumption by callers.
        print(json.dumps(summary, indent=2, ensure_ascii=False, default=json_serial))
        return

    # Normal mode: poll indefinitely for new files.
    processed_count = 0
    skipped_count = 0
    
    if ignore_patterns:
        logger.info(
            "Ignoring %d pattern(s) during import: %s",
            len(ignore_patterns),
            ", ".join(ignore_patterns),
        )

    previous_orphans: Optional[List[str]] = None

    while True:
        for jpath in discover_metadata(import_path, ignore_patterns):
            # Smart resync: check if file needs processing
            if not needs_resync(jpath, force_resync):
                if jpath not in seen:  # Only log once per session
                    logger.debug("Skipping %s - no changes detected", jpath)
                    skipped_count += 1
                seen.add(jpath)
                continue
                
            try:
                parsed = parse_civitai_json(jpath)
                result = register_adapter_from_metadata(
                    parsed, json_path=jpath, dry_run=False,
                )
                logger.info("Processed %s: %s", jpath, result["status"])
                processed_count += 1
                seen.add(jpath)
            except Exception as exc:
                logger.exception("Failed to process %s: %s", jpath, exc)

        orphans = discover_orphan_safetensors(import_path, ignore_patterns)
        if previous_orphans != orphans:
            if orphans:
                logger.warning(
                    "Found %d safetensors without metadata: %s",
                    len(orphans),
                    ", ".join(orphans),
                )
            else:
                logger.info("No safetensors missing metadata detected")
            previous_orphans = orphans
        
        # In force_resync mode, run once and exit (don't poll indefinitely)
        if force_resync:
            logger.info(
                "Force resync completed. Processed %d files, skipped %d files.", 
                processed_count, skipped_count,
            )
            break
            
        time.sleep(poll_seconds)


def main():
    """Main function to run the importer."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", 
        action="store_true", 
        help="Don't persist changes, only log them",
    )
    parser.add_argument(
        "--force-resync", 
        action="store_true", 
        help="Re-process all files even if seen before",
    )
    parser.add_argument(
        "--path", 
        default=settings.IMPORT_PATH, 
        help="Directory to scan for metadata",
    )
    parser.add_argument(
        "--poll", 
        type=int, 
        default=settings.IMPORT_POLL_SECONDS, 
        help="Poll interval in seconds",
    )
    parser.add_argument(
        "--ignore", 
        action="append",
        default=None,
        help="Glob pattern to ignore (can be specified multiple times)",
    )
    args = parser.parse_args()

    ignore_patterns = list(settings.IMPORT_IGNORE_PATTERNS)
    if args.ignore:
        ignore_patterns.extend(args.ignore)

    logging.basicConfig(level=logging.INFO)
    try:
        run_poller(
            args.path,
            args.poll,
            args.dry_run,
            args.force_resync,
            ignore_patterns or None,
        )
    except KeyboardInterrupt:
        logger.info("Importer stopped by user")


if __name__ == "__main__":
    main()
