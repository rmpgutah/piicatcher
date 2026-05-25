"""FastAPI entrypoint.

The app exposes a small REST surface at /api/* that mirrors the desktop app's
IPC contract, plus serves the built React frontend as static files from `/`
when the dist directory exists (production mode). In dev, Vite serves the
frontend on its own port and proxies /api to here.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import service
from .models import (
    AddNetworkSourceRequest,
    AddSqliteSourceRequest,
    Health,
    ScanRequest,
    ScanResult,
    Source,
)

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PIICatcher Web",
    version="0.1.0",
    description="Web UI for piicatcher PII/PHI scanner.",
)

# CORS: in dev the Vite dev server (port 5173) calls this API on port 8000.
# Production deploys serve both from the same origin so CORS is a no-op there.
if os.environ.get("PIICATCHER_WEB_DEV_CORS") == "1":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ---------- API ----------


@app.get("/api/health", response_model=Health)
def health() -> Health:
    return service.get_health()


@app.get("/api/sources", response_model=list[Source])
async def list_sources() -> list[Source]:
    try:
        return await asyncio.to_thread(service.list_sources)
    except Exception as e:
        logger.exception("list_sources failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/sources/sqlite")
async def add_sqlite_source(req: AddSqliteSourceRequest) -> None:
    try:
        await asyncio.to_thread(service.add_sqlite_source, req)
    except Exception as e:
        logger.exception("add_sqlite_source failed")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/sources/network")
async def add_network_source(req: AddNetworkSourceRequest) -> None:
    try:
        await asyncio.to_thread(service.add_network_source, req)
    except Exception as e:
        logger.exception("add_network_source failed")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.delete("/api/sources/{name}")
async def remove_source(name: str) -> None:
    try:
        await asyncio.to_thread(service.remove_source, name)
    except Exception as e:
        logger.exception("remove_source failed for %s", name)
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.post("/api/scans", response_model=ScanResult)
async def run_scan(req: ScanRequest) -> ScanResult:
    # piicatcher's scan is sync and CPU/IO bound; offload to a thread so the
    # event loop stays responsive for /api/health polls from the UI.
    try:
        return await asyncio.to_thread(service.run_scan, req)
    except Exception as e:
        logger.exception("run_scan failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ---------- static frontend (production) ----------

# When the React app is built, we mount its dist/ at /. This block is
# intentionally tolerant of the dir not existing (dev mode, tests).
_FRONTEND_DIST = Path(
    os.environ.get(
        "PIICATCHER_WEB_FRONTEND_DIST",
        str(Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"),
    )
)


if _FRONTEND_DIST.is_dir():
    # /assets/* is handled by StaticFiles directly. Other routes fall through
    # to a SPA fallback that returns index.html so React-Router-style client
    # routing works.
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    @app.get("/")
    @app.get("/{path:path}")
    def spa_fallback(path: str = "") -> FileResponse:
        # Don't fall through for /api/* — let FastAPI's 404 handler take it.
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        return FileResponse(_FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def root_dev() -> dict:
        return {
            "service": "piicatcher-web",
            "mode": "dev (frontend not built)",
            "frontend_dist_searched": str(_FRONTEND_DIST),
        }
