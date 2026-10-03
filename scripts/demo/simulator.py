"""Deterministic SDNext HTTP simulator: no model inference or downloads."""

import asyncio
import base64
import json
import struct
import zlib
from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

app = FastAPI(title="SDNext simulator — fixed test image, not model output")
scenario = "success"


def fixture_png() -> bytes:
    """Build a valid deterministic 32x32 blue PNG using only the standard library."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + kind
            + data
            + struct.pack("!I", zlib.crc32(kind + data))
        )

    pixels = (b"\x00" + b"\x35\x70\xb0" * 32) * 32
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack("!2I5B", 32, 32, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(pixels))
        + chunk(b"IEND", b"")
    )


class Scenario(BaseModel):
    """Controls available only on the simulator's private network."""

    scenario: Literal["success", "http-error", "timeout", "malformed", "invalid-image"]


@app.post("/__demo/scenario")
def set_scenario(payload: Scenario):
    """Select the response for subsequent submissions."""
    global scenario
    scenario = payload.scenario
    return {"scenario": scenario, "simulated": True}


@app.get("/sdapi/v1/options")
def options():
    """Answer the real client's connectivity check."""
    return {"simulated": True}


@app.get("/sdapi/v1/progress")
def progress():
    """Provide compatibility without pretending to measure inference progress."""
    return {"progress": 0.0, "simulated": True}


@app.post("/sdapi/v1/txt2img")
async def generate(payload: dict):
    """Return a fixed fixture or a controlled upstream failure."""
    selected = scenario
    if selected == "timeout":
        await asyncio.sleep(10)
    else:
        await asyncio.sleep(1)
    if selected == "http-error":
        return Response("demo-private-detail: upstream failed", status_code=503)
    if selected == "malformed":
        return JSONResponse(["invalid response shape"])
    image = (
        "not-base64!"
        if selected == "invalid-image"
        else base64.b64encode(fixture_png()).decode()
    )
    return {
        "images": [image],
        "info": json.dumps({
            "simulated": True,
            "description": "Fixed PNG fixture; no AI inference",
            "seed": payload.get("seed"),
        }),
    }
