"""Pydantic models that define the HTTP wire format.

These intentionally mirror the TypeScript types in
[`web/frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts) so the two
sides stay in sync. The desktop app's IPC contract was the design template;
the web app uses HTTP+JSON instead of Tauri IPC but the shape is identical
so the React components are reused unchanged.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SourceKind = Literal[
    "sqlite",
    "postgresql",
    "mysql",
    "redshift",
    "snowflake",
    "athena",
    "bigquery",
]

ScanType = Literal["metadata", "data"]
NetworkSourceKind = Literal["postgresql", "mysql", "redshift"]


def _camel_case(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class _CamelModel(BaseModel):
    """Base that serializes snake_case fields as camelCase to match the React side."""

    model_config = ConfigDict(alias_generator=_camel_case, populate_by_name=True)


class Health(_CamelModel):
    piicatcher_found: bool
    piicatcher_path: Optional[str] = None
    piicatcher_version: Optional[str] = None
    error_message: Optional[str] = None


class Source(_CamelModel):
    name: str
    kind: SourceKind
    summary: str


class AddSqliteSourceRequest(_CamelModel):
    name: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    path: str


class AddNetworkSourceRequest(_CamelModel):
    name: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: NetworkSourceKind
    host: str
    port: Optional[int] = None
    username: str
    password: str
    database: str


class ScanRequest(_CamelModel):
    source_name: str
    scan_type: ScanType = "metadata"
    incremental: bool = True
    list_all: bool = False
    sample_size: Optional[int] = None
    include_schema: list[str] = Field(default_factory=list)
    exclude_schema: list[str] = Field(default_factory=list)


class PiiFinding(_CamelModel):
    schema_: str = Field(alias="schema")
    table: str
    column: str
    pii_type: str
    scanner: str


class ScanResult(_CamelModel):
    source: str
    scan_type: ScanType
    started_at: datetime
    finished_at: datetime
    findings: list[PiiFinding]
    columns_scanned: int
    columns_with_pii: int
