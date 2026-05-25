"""piicatcher embedding layer.

The web service imports piicatcher's Python API directly rather than shelling
out (unlike the desktop app, which spawns a subprocess). That removes a
serialization round-trip and means catalog-state changes are immediately
visible to the next request without a subprocess setup cost.

The catalog backend defaults to a SQLite file at `$PIICATCHER_WEB_DATA/catalog.db`.
Setting `PIICATCHER_CATALOG_HOST` (etc.) switches to a Postgres-backed catalog,
which is what docker-compose uses in production.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .models import (
    AddNetworkSourceRequest,
    AddSqliteSourceRequest,
    Health,
    PiiFinding,
    ScanRequest,
    ScanResult,
    Source,
)

logger = logging.getLogger(__name__)


# ---------- catalog setup ----------

_DEFAULT_DATA_DIR = Path(os.environ.get("PIICATCHER_WEB_DATA", "/var/lib/piicatcher-web"))


def _catalog_kwargs() -> dict:
    """Resolve the catalog config from env (matches dbcat's CLI flags)."""
    secret = os.environ.get("PIICATCHER_CATALOG_SECRET", "dev-secret-change-me")
    host = os.environ.get("PIICATCHER_CATALOG_HOST")
    if host:
        # Postgres-backed catalog (production path).
        return {
            "app_dir": _DEFAULT_DATA_DIR,
            "secret": secret,
            "host": host,
            "port": int(os.environ.get("PIICATCHER_CATALOG_PORT", "5432")),
            "user": os.environ.get("PIICATCHER_CATALOG_USER"),
            "password": os.environ.get("PIICATCHER_CATALOG_PASSWORD"),
            "database": os.environ.get("PIICATCHER_CATALOG_DB"),
        }
    # SQLite catalog (zero-config dev path).
    _DEFAULT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "app_dir": _DEFAULT_DATA_DIR,
        "secret": secret,
        "path": str(_DEFAULT_DATA_DIR / "catalog.db"),
    }


@contextmanager
def _catalog_session() -> Iterator[object]:
    """Open the dbcat catalog and yield an active managed session.

    dbcat is lazily imported so import errors surface from /api/health rather
    than crashing the server on boot — keeps the UI's health banner useful.
    """
    from dbcat.api import init_db, open_catalog

    catalog = open_catalog(**_catalog_kwargs())
    try:
        init_db(catalog)
        with catalog.managed_session:
            yield catalog
    finally:
        catalog.close()


# ---------- health ----------


def get_health() -> Health:
    try:
        import piicatcher as _piicatcher  # noqa: F401
        from piicatcher import __version__
    except Exception as e:
        return Health(
            piicatcher_found=False,
            error_message=f"piicatcher import failed: {e!r}",
        )

    try:
        import piicatcher
        path = str(Path(piicatcher.__file__).parent)
    except Exception:
        path = None

    return Health(
        piicatcher_found=True,
        piicatcher_path=path,
        piicatcher_version=__version__,
        error_message=None,
    )


# ---------- sources ----------


def add_sqlite_source(req: AddSqliteSourceRequest) -> None:
    from dbcat.api import add_sqlite_source as _add

    with _catalog_session() as catalog:
        _add(catalog=catalog, name=req.name, uri=req.path)


def add_network_source(req: AddNetworkSourceRequest) -> None:
    # Map our public kind onto dbcat's add_* helper.
    from dbcat.api import (
        add_mysql_source,
        add_postgresql_source,
        add_redshift_source,
    )

    fn_map = {
        "postgresql": add_postgresql_source,
        "mysql": add_mysql_source,
        "redshift": add_redshift_source,
    }
    fn = fn_map[req.kind]

    with _catalog_session() as catalog:
        kwargs = dict(
            catalog=catalog,
            name=req.name,
            uri=req.host,
            username=req.username,
            password=req.password,
            database=req.database,
        )
        if req.port is not None:
            kwargs["port"] = req.port
        fn(**kwargs)


def list_sources() -> list[Source]:
    with _catalog_session() as catalog:
        result: list[Source] = []
        for s in catalog.get_sources():
            summary = ""
            uri = getattr(s, "uri", None)
            database = getattr(s, "database", None)
            if uri and database:
                summary = f"{uri} / {database}"
            elif uri:
                summary = uri
            elif database:
                summary = database
            result.append(
                Source(name=s.name, kind=s.source_type, summary=summary or "—")
            )
        return result


def remove_source(name: str) -> None:
    with _catalog_session() as catalog:
        source = catalog.get_source(name)
        catalog.delete_source(source)


# ---------- scanning ----------


def run_scan(req: ScanRequest) -> ScanResult:
    """Synchronous scan. Callers should wrap with asyncio.to_thread."""
    from piicatcher.api import ScanTypeEnum, scan_database

    started_at = datetime.now(timezone.utc)

    with _catalog_session() as catalog:
        source = catalog.get_source(req.source_name)
        rows = scan_database(
            catalog=catalog,
            source=source,
            scan_type=ScanTypeEnum(req.scan_type),
            incremental=req.incremental,
            list_all=req.list_all,
            sample_size=req.sample_size or 1000,
            include_schema_regex=req.include_schema or None,
            exclude_schema_regex=req.exclude_schema or None,
        )

    findings: list[PiiFinding] = []
    for row in rows:
        # scan_database returns 5-tuples: [schema, table, column, pii_type, scanner]
        # In list_all mode, rows without PII have empty pii_type / scanner.
        if len(row) < 5:
            continue
        schema, table, column, pii_type, scanner = row[0], row[1], row[2], row[3], row[4]
        if not pii_type:
            continue
        # piicatcher emits 'PiiTypes.EMAIL' style identifiers; strip prefix.
        if isinstance(pii_type, str) and pii_type.startswith("PiiTypes."):
            pii_type = pii_type[len("PiiTypes."):]
        findings.append(
            PiiFinding(
                schema=str(schema),
                table=str(table),
                column=str(column),
                pii_type=str(pii_type),
                scanner=str(scanner),
            )
        )

    finished_at = datetime.now(timezone.utc)

    return ScanResult(
        source=req.source_name,
        scan_type=req.scan_type,
        started_at=started_at,
        finished_at=finished_at,
        findings=findings,
        columns_scanned=len(rows),
        columns_with_pii=len(findings),
    )
