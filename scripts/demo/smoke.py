"""Exercise the running demo through HTTP, without mocking application services."""

import base64
import json
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

API = "http://127.0.0.1:8000"
SIMULATOR = "http://sdnext-simulator:7860"
STATE = Path("/tmp/lora-demo-check.json")


def request(path, payload=None, *, base=API, expected=200):
    """Make an HTTP request and check its status, including expected errors."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json", "X-API-Key": "demo-token"},
    )
    try:
        response = urllib.request.urlopen(req, timeout=8)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        body = response.read()
        if response.status != expected:
            raise AssertionError(
                f"{path}: expected {expected}, got {response.status}: {body[:300]!r}"
            )
        return json.loads(body)


def scenario(name):
    """Set simulator behavior; never changes application configuration."""
    request("/__demo/scenario", {"scenario": name}, base=SIMULATOR)


def submit():
    """Submit an ordinary request to the production queue endpoint."""
    response = request(
        "/api/v1/generation/queue-generation?save_images=true&return_format=base64",
        {
            "prompt": "A blue square — deterministic integration demonstration",
            "seed": 42,
            "steps": 1,
            "width": 64,
            "height": 64,
        },
    )
    print(f"POST queue-generation -> delivery_id={response['delivery_id']}", flush=True)
    return response["delivery_id"]


def job(job_id):
    """Read persisted status using the returned delivery ID."""
    return request(f"/api/v1/generation/jobs/{job_id}")["delivery"]


def wait_for(job_id, status):
    """Poll to a deadline; report observed state changes."""
    deadline = time.monotonic() + 30
    previous = None
    while time.monotonic() < deadline:
        data = job(job_id)
        current = data["status"]
        if current != previous:
            print(f"GET job {job_id}: {current}", flush=True)
            previous = current
        if current == status:
            return data
        if current in {"failed", "completed"}:
            raise AssertionError(f"Unexpected terminal status: {data}")
        time.sleep(0.2)
    raise AssertionError(f"Job {job_id} did not reach {status} within 30 seconds")


def verify_image(data):
    """Decode PNG chunks, CRCs and pixels; also verify shared filesystem storage."""
    result = data["result"]
    assert result["generation_info"]["simulated"] is True
    png = base64.b64decode(result["images"][0], validate=True)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    offset, compressed = 8, b""
    while offset < len(png):
        size = struct.unpack("!I", png[offset : offset + 4])[0]
        kind = png[offset + 4 : offset + 8]
        body = png[offset + 8 : offset + 8 + size]
        crc = struct.unpack("!I", png[offset + 8 + size : offset + 12 + size])[0]
        assert zlib.crc32(kind + body) == crc
        if kind == b"IDAT":
            compressed += body
        offset += size + 12
    assert len(zlib.decompress(compressed)) == 32 * (1 + 32 * 3)
    files = list(Path("/app/outputs").glob(f"{result['job_id']}_*.png"))
    assert files and any(file.read_bytes() == png for file in files)
    assert data["started_at"] and data["finished_at"]
    print(
        "PASS: valid PNG, simulated metadata, timestamps and shared storage",
        flush=True,
    )


def main():
    """Run one phase between worker stops and API restarts."""
    phase = sys.argv[1]
    if phase == "restore":
        scenario("success")
    elif phase == "queued":
        scenario("success")
        request("/api/v1/generation/queue-generation", {}, expected=422)
        request("/api/v1/generation/jobs/nonexistent-demo-job", expected=404)
        job_id = submit()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            assert job(job_id)["status"] == "queued", (
                "Worker stopped but job executed: possible fallback"
            )
            time.sleep(0.2)
        STATE.write_text(json.dumps({"delivery_id": job_id}))
        print(
            "PASS: job remains queued while the real RQ worker is stopped", flush=True
        )
    elif phase == "completed":
        state = json.loads(STATE.read_text())
        result = wait_for(state["delivery_id"], "completed")
        verify_image(result)
        state["delivery"] = result
        STATE.write_text(json.dumps(state))
    elif phase == "persisted":
        deadline = time.monotonic() + 30
        while True:
            try:
                request("/health")
                break
            except (urllib.error.URLError, OSError):
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.2)
        state = json.loads(STATE.read_text())
        assert job(state["delivery_id"]) == state["delivery"]
        results = request("/api/v1/generation/results")
        assert any(item["job_id"] == state["delivery_id"] for item in results)
        verify_image(state["delivery"])
        print("PASS: same job and history result survived API restart", flush=True)
    elif phase == "failures":
        expected = {
            "http-error": "SDNext returned HTTP 503",
            "timeout": "SDNext request timed out",
            "malformed": "Invalid SDNext response",
            "invalid-image": "Could not save generated images",
        }
        for name, message in expected.items():
            scenario(name)
            failed = wait_for(submit(), "failed")
            assert failed["result"]["error_message"] == message, failed
            assert "demo-private-detail" not in json.dumps(failed)
            assert failed["finished_at"]
            print(f"PASS: {name} -> {message}", flush=True)
        scenario("success")
        verify_image(wait_for(submit(), "completed"))
        print("PASS: worker processes a valid job after upstream failures", flush=True)
    else:
        raise SystemExit(f"Unknown phase: {phase}")


if __name__ == "__main__":
    main()
