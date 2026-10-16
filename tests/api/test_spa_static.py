"""Tests for how ``app.main`` serves the built SPA."""

import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import SPA_DIST_DIR, SPAStaticFiles

REPO_ROOT = Path(__file__).resolve().parents[2]


def _vite_option(config: str, name: str) -> str:
    match = re.search(rf"^\s*{name}:\s*'([^']+)'", config, re.MULTILINE)
    assert match, f"{name} not found in vite.config.ts"
    return match.group(1)


def test_spa_dist_dir_matches_vite_build_output():
    config = (REPO_ROOT / "vite.config.ts").read_text(encoding="utf-8")
    root = _vite_option(config, "root")
    out_dir = _vite_option(config, "outDir")

    assert (REPO_ROOT / root / out_dir).resolve() == SPA_DIST_DIR


def test_vite_build_emits_index_html():
    config = (REPO_ROOT / "vite.config.ts").read_text(encoding="utf-8")
    match = re.search(r"const entryFile = fileURLToPath\(new URL\('([^']+)'", config)
    assert match, "entryFile not found in vite.config.ts"

    # A script entry builds no index.html, leaving SPAStaticFiles nothing to serve.
    entry = (REPO_ROOT / match.group(1)).resolve()
    root = (REPO_ROOT / _vite_option(config, "root")).resolve()
    assert entry == root / "index.html"


def test_spa_static_files_fall_back_to_index(tmp_path):
    (tmp_path / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (tmp_path / "app.js").write_text("console.log(1)", encoding="utf-8")
    application = FastAPI()
    application.mount("/", SPAStaticFiles(tmp_path), name="spa")
    client = TestClient(application)

    assert client.get("/app.js").text == "console.log(1)"
    assert client.get("/").text == "<html>spa</html>"
    assert client.get("/generate/history").text == "<html>spa</html>"


def test_spa_static_files_without_build_return_404(tmp_path):
    application = FastAPI()
    application.mount("/", SPAStaticFiles(tmp_path / "missing"), name="spa")
    client = TestClient(application)

    assert client.get("/").status_code == 404
