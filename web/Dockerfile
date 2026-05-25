# syntax=docker/dockerfile:1.7
#
# Multi-stage build:
#   1. node — build the React frontend into static assets.
#   2. python — install the FastAPI service + piicatcher, copy in the static
#      bundle, and run uvicorn. FastAPI serves both /api/* and the SPA from
#      the same origin (no CORS in production).
#
# Build from the repo root so the build context has access to web/frontend
# and web/api:
#   docker build -f web/Dockerfile -t piicatcher-web .

# ---------- 1. frontend build ----------
FROM node:22-alpine AS frontend

WORKDIR /app
# Copy lockfile first so it's cached separately from source.
COPY web/frontend/package.json web/frontend/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY web/frontend/ .
RUN pnpm build
# -> /app/dist


# ---------- 2. python runtime ----------
# python:3.10-slim — within the dbcat <=3.10.8 ceiling, see piicatcher's MIGRATION.md.
FROM python:3.10-slim AS runtime

# System deps that piicatcher's transitive C-extensions (psycopg2, mysqlclient)
# need to compile from source. `mysql-client` here gives us libmysqlclient-dev
# headers under the same package name on Debian-slim.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
      default-libmysqlclient-dev \
      pkg-config \
      curl \
      && rm -rf /var/lib/apt/lists/*

# Install the API in a dedicated venv to keep system Python clean.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PIICATCHER_WEB_DATA=/var/lib/piicatcher-web \
    PIICATCHER_WEB_FRONTEND_DIST=/app/frontend/dist

RUN python -m venv $VIRTUAL_ENV && pip install --no-cache-dir --upgrade pip

# Install with pip from a generated requirements list to avoid pulling Poetry
# into the runtime image. Done in two steps so the dep install layer is cached
# until pyproject.toml changes.
COPY web/api/pyproject.toml /app/api/pyproject.toml
RUN pip install --no-cache-dir \
      "fastapi>=0.115,<0.116" \
      "uvicorn[standard]>=0.32,<0.33" \
      "pydantic>=2.9,<3" \
      "python-multipart>=0.0.12,<0.1" \
      "piicatcher>=0.21.2,<0.22"

# Copy backend source.
COPY web/api/ /app/api/

# Copy the built frontend from the node stage.
COPY --from=frontend /app/dist /app/frontend/dist

WORKDIR /app/api

# Catalog state and any user-mounted SQLite DBs live under /var/lib/piicatcher-web.
RUN mkdir -p $PIICATCHER_WEB_DATA && chmod 750 $PIICATCHER_WEB_DATA
VOLUME $PIICATCHER_WEB_DATA

EXPOSE 8000

# Healthcheck — hits the same endpoint the UI uses, so a green container ==
# a UI that won't show the red banner on first load.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "piicatcher_web.main:app", "--host", "0.0.0.0", "--port", "8000"]
