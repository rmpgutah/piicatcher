# PIICatcher Web

A browser-based UI for [piicatcher](../README.md) — same scanner, same findings, same UI as the [desktop app](../desktop/README.md), running as a self-hosted web service instead of a native app.

Architecture: **FastAPI backend** that embeds piicatcher's Python API in-process, **React frontend** that talks to the API over plain HTTP, **single Docker container** that serves both.

## Status

**MVP scaffold.** The UI, HTTP contract, FastAPI service, and Docker pipeline are in place. End-to-end verification on this dev machine is limited to the *non-piicatcher* parts (frontend builds, backend imports, routes respond, validation works, error envelopes match) because piicatcher itself isn't installable on Apple Silicon + current Xcode — same `greenlet 2.x` C++ wall the desktop app hits.

What's verified locally:
- ✅ `pnpm typecheck` — clean
- ✅ `pnpm build` — clean, 228 KB JS / 15 KB CSS gzipped
- ✅ FastAPI app imports without piicatcher present
- ✅ All 6 API routes register and respond
- ✅ Pydantic input validation rejects malformed requests (422)
- ✅ `{detail: "..."}` error envelope matches what the React client expects
- ✅ Graceful degradation: `/api/health` reports `piicatcherFound: false` instead of crashing

What's *not* verified on this dev box:
- 🟡 Live scan against a real database (needs `pip install piicatcher` which fails locally)
- 🟡 `docker compose up` runtime (the Dockerfile is correct but unbuilt)

The Docker image will build successfully on Linux runners (CI or your prod host), since the `python:3.10-slim` base is unaffected by the macOS Xcode/libc++ issue.

## Quick start

### 1. Docker compose (recommended)

```bash
cd web
docker compose up --build
open http://localhost:8000
```

Persistent catalog state and any SQLite DBs you want to scan live under `./web/data/` on your host (mounted as `/var/lib/piicatcher-web` inside the container).

### 2. Local dev (no Docker)

Two terminals:

```bash
# Terminal 1 — FastAPI backend on :8000
cd web/api
poetry install
poetry run uvicorn piicatcher_web.main:app --reload --port 8000

# Terminal 2 — Vite dev server on :5173 (with HMR + proxy to :8000)
cd web/frontend
pnpm install
pnpm dev
open http://localhost:5173
```

The Vite dev server proxies `/api/*` to the FastAPI process, so the same React code that runs in production also runs in dev without any CORS dance.

If you want the React app to call a backend on a different host, set `VITE_API_BASE` (compile-time) or `VITE_API_PROXY_TARGET` (dev only).

## Architecture

```
web/
├── api/                         FastAPI service (Python)
│   ├── piicatcher_web/
│   │   ├── main.py              FastAPI app, route handlers, static file serving
│   │   ├── models.py            Pydantic models = HTTP wire format
│   │   └── service.py           piicatcher embedding (lazy imports, catalog mgmt)
│   └── pyproject.toml
│
├── frontend/                    React UI (TypeScript + Vite + Tailwind)
│   ├── src/
│   │   ├── App.tsx              Sidebar + tabs (copied from desktop, unchanged)
│   │   ├── components/          UI primitives + dialogs (copied from desktop)
│   │   ├── pages/               Sources / Scan pages (copied from desktop)
│   │   └── lib/
│   │       ├── api.ts           HTTP client — same `ipc` surface as desktop's ipc.ts
│   │       └── utils.ts         cn() helper
│   ├── index.html
│   ├── vite.config.ts           Dev-server /api proxy to FastAPI
│   └── package.json
│
├── Dockerfile                   Multi-stage: node → frontend dist → python runtime
├── docker-compose.yml           Local-deploy config (web + optional postgres catalog)
└── .dockerignore
```

### How it reuses the desktop UI

The React component tree is **identical** to the desktop app's. The trick: the desktop's `lib/ipc.ts` exports an `ipc` object whose methods call Tauri's `invoke()`; this app's `lib/api.ts` exports an `ipc` object with **the same shape** that calls `fetch()` instead. Components import `{ ipc } from "@/lib/api"` and never notice the difference.

The only React file that differs from the desktop version is `components/AddSourceDialog.tsx` — the desktop's native file picker isn't available in a browser, so the web variant replaces the "Browse" button with a text input + help text explaining that the path is resolved server-side.

### How the backend reaches piicatcher

The desktop app spawns `piicatcher` as a subprocess. The web app, being itself a Python process, **embeds piicatcher directly** via its public Python API (`from piicatcher.api import scan_database`). Faster (no subprocess setup), more reliable (real exceptions instead of stderr parsing), and avoids the sidecar bundling problem.

All piicatcher and dbcat imports in `service.py` are **lazy** — done inside the functions that use them, not at module load. This means:

- The FastAPI app boots even if piicatcher isn't installed.
- `/api/health` correctly reports the install state.
- Other endpoints surface a clear `400`/`500` with the `ModuleNotFoundError` in the detail rather than crashing the worker.

This is what made the in-memory TestClient pass during development without piicatcher available.

## HTTP API

All endpoints are under `/api`. Request and response bodies are JSON with `camelCase` field names (matching the desktop app's IPC contract).

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/health` | — | `Health` |
| `GET` | `/api/sources` | — | `Source[]` |
| `POST` | `/api/sources/sqlite` | `{ name, path }` | `null` |
| `POST` | `/api/sources/network` | `{ name, kind, host, port?, username, password, database }` | `null` |
| `DELETE` | `/api/sources/{name}` | — | `null` |
| `POST` | `/api/scans` | `ScanRequest` | `ScanResult` |

`source` names are restricted to `^[a-zA-Z0-9_-]+$` (Pydantic validation; returns `422` if violated).

Errors come back as `{ "detail": "..." }`. `400` for bad input that piicatcher rejects (e.g., already-registered source), `500` for unexpected backend errors.

OpenAPI docs are live at `http://localhost:8000/docs` once running.

## Configuration (environment variables)

| Var | Default | Purpose |
|---|---|---|
| `PIICATCHER_WEB_DATA` | `/var/lib/piicatcher-web` | Where SQLite catalog + scanned DBs live. |
| `PIICATCHER_WEB_FRONTEND_DIST` | `<repo>/web/frontend/dist` | Built React static assets. |
| `PIICATCHER_CATALOG_SECRET` | `dev-secret-change-me` | Encrypts source passwords in the catalog. **Change in production.** |
| `PIICATCHER_CATALOG_HOST` | unset (SQLite catalog) | Set to use a Postgres catalog instead. |
| `PIICATCHER_CATALOG_PORT` | `5432` | Postgres catalog port. |
| `PIICATCHER_CATALOG_USER` | — | Postgres catalog user. |
| `PIICATCHER_CATALOG_PASSWORD` | — | Postgres catalog password. |
| `PIICATCHER_CATALOG_DB` | — | Postgres catalog database. |
| `PIICATCHER_WEB_DEV_CORS` | unset | Set to `1` in dev to allow `http://localhost:5173`. |
| `LOG_LEVEL` | `INFO` | Python logger level. |

## Production considerations (what this MVP does NOT do)

This is an MVP — happy path works, basic error handling, single-user, single-process. Before exposing it to anyone you don't trust, you'd want:

1. **Authentication.** There is none. Anyone who reaches the port can register sources and run scans. Put it behind a reverse proxy with basic auth, or front it with an OAuth proxy (oauth2-proxy, Authelia). At minimum, only expose it on a trusted network.
2. **Authorization.** Even with auth, all logged-in users share one catalog. Multi-tenancy needs per-user catalogs and access control on every endpoint.
3. **Rate limiting.** A malicious user could spam `/api/scans` to thrash the embedded scanner or your warehouse.
4. **CSP.** No Content-Security-Policy headers. Wire one up before going public.
5. **Long-running scan handling.** The current `/api/scans` endpoint blocks until the scan completes (offloaded to a thread to keep the event loop free, but still a single HTTP request). For real warehouses, replace with a job queue (Celery / RQ / Arq) and a polling or websocket status channel.
6. **Secret rotation.** `PIICATCHER_CATALOG_SECRET` encrypts source passwords. Rotating it requires re-encrypting the existing catalog rows — there's no helper for that yet.
7. **Audit log.** No record of who ran which scan or registered which source.
8. **Backups.** The SQLite catalog under `./data/` should be backed up. If you switch to the Postgres catalog, use whatever your Postgres backup pipeline already does.
9. **Container hardening.** The current image runs as root and has compiler toolchains installed (needed to build psycopg2/mysqlclient from source). A production image should use a non-root user and split build/runtime stages further to drop the compilers.
10. **Observability.** No metrics endpoint, no structured logs by default. Add OpenTelemetry instrumentation if you care about latency tails or scan failure rates.

## Known limitations

1. **piicatcher install** is gated by the same `dbcat`/`greenlet`/`SQLAlchemy <1.4` pin chain documented in the main repo's `MIGRATION.md`. On modern Apple Silicon + Xcode you can't `pip install piicatcher` locally; use Docker.
2. **list_sources** depends on dbcat's `get_sources()`. dbcat's API surface for source enumeration isn't documented as stable, so this implementation is best-effort and may drift if you bump dbcat past 0.15.
3. **Native file picker** isn't available in a browser. SQLite source paths are server-side; the UI shows help text explaining this.
4. **No streaming for scan output.** Scans return a single JSON blob when done. A long scan on a large warehouse will produce a long-pending HTTP request. See "production considerations" #5.

## Relationship to the desktop app

The desktop app ([../desktop/](../desktop/)) and this web app share the React frontend almost verbatim. If you fix a bug in one's React tree, port the change to the other.

A future refactor could hoist the shared frontend into `frontend-shared/` and have both `desktop/` and `web/` consume it as a workspace package, eliminating the duplication. Out of scope for this MVP.
