# Migration Notes — 0.21.x → 0.22.0

This release modernizes piicatcher's own dependency surface and CI within the
constraints imposed by the upstream `dbcat` library. It is **not** a Python 3.11+
upgrade — see the "Why not Python 3.11+" section below.

## TL;DR

- Python 3.8 support **dropped** (Python 3.8 reached end-of-life in October 2024).
- Python is now `>=3.9, <=3.10.8` (the upper bound is enforced by `dbcat`).
- Several direct dependencies bumped to current versions.
- Dev tool stack (`black` + `flake8` + `isort`) replaced with `ruff`.
- CI workflows updated to current action versions and a current runner image.
- No public API or CLI changes.

## What changed

### Runtime dependencies

| Package | Before | After | Notes |
|---|---|---|---|
| `python-json-logger` | `^2.0.2` | `^3.2` | v3 reorganized exports; piicatcher now uses the future-compatible `from pythonjsonlogger.jsonlogger import JsonFormatter` import. |
| `tabulate` | `^0.8.9` | `^0.9.0` | API-compatible. |
| `tqdm` | `^4.62.3` | `^4.67` | API-compatible. |
| `catalogue` | `^2.0.6` | `^2.0.10` | Patch updates only. |
| `pyyaml` | `*` | `^6.0` | Was unpinned; now bounded. |
| `click` | `*` | `^8.1` | Was unpinned; now bounded. |
| `google-cloud-bigquery-storage` | `2.20.0` | `^2.20` | Loosened the exact pin to allow patches. |
| `commonregex-improved` | `1.0.2` | `^1.0.2` | Loosened the exact pin to allow patches. |
| `dataclasses` shim | present | **removed** | Built into Python 3.7+; the shim was only needed for 3.6. |

### Dependencies we could **not** bump (gated by `dbcat==0.15.0`)

- `typer` — capped at `<0.5` by dbcat. Stays on `^0.4.0`.
- `sqlalchemy-bigquery` — stays at `1.6.1` (the last version compatible with the SQLAlchemy 1.3 line dbcat requires).
- `dbcat` itself — bumped from `0.14.2` to the latest `^0.15.0`, which itself still pins Python `<=3.10.8`, `SQLAlchemy <1.4`, `boto3 ==1.17.23`, `botocore <1.21`, `pyparsing <3.0`, `pyathena ==1.11.5`, `snowflake-sqlalchemy ==1.2.4`, and `greenlet <3`.

These pins are why this release is a "honest minimum" modernization rather than a true platform upgrade. Moving past them requires modernizing or replacing `dbcat`, which is a separate, larger effort.

### Dev dependencies

The old lint stack (`black==19.10b0`, `flake8`, `isort`, `pytest-pylint`) is replaced by a single tool — **`ruff`**:

- Linting + import sorting + Pyupgrade hints in one tool, much faster.
- Equivalent rules are configured in `pyproject.toml` (`[tool.ruff.lint]`).
- The previous `setup.cfg` linter sections were removed; mypy config moved into `pyproject.toml`.

Other dev-dep bumps: `mypy ^1.13`, `pytest ^7.4`, `coverage ^7.6`, `pytest-cov ^5.0`, `twine ^5.1`, `pytest-mock ^3.14`, `pytest-cases ^3.8`, `pytest-order ^1.3`, plus updated `types-*` stubs.

> **Note on pytest version:** Kept at `^7.4` rather than 8. `pytest-cases 3.8` has compatibility issues with pytest 8's collection changes; this is the highest pytest version that works cleanly with this test suite without further fixture rewrites.

### Project tooling

- `[tool.poetry.dev-dependencies]` → `[tool.poetry.group.dev.dependencies]` (forward-compatible with Poetry 2.x).
- `setup.cfg` stripped down to `[metadata]` only (linter config moved to `pyproject.toml`).
- `Pipfile`'s `python_version` bumped to `3.10` (vestigial — Poetry is the source of truth).
- Project version: `0.21.2` → `0.22.0`. `piicatcher/__init__.py` `__version__` synced (was lagging at `0.21.1`).

### CI workflows

`.github/workflows/ci.yml`, `docker-build.yml`, `publish.yml`:

- Python matrix `['3.8', '3.9', '3.10.8']` → `['3.9', '3.10.8']`.
- Runner `ubuntu-20.04` → `ubuntu-22.04` (20.04 reached EOL on GitHub-hosted runners in 2025).
- `actions/checkout v3 → v4`, `actions/setup-python v4 → v5`, `codecov-action v3 → v5`.
- `abatilo/actions-poetry v2 → v3` with `poetry-version: 1.8.3` (was `1.2.2`).
- `docker/*-action` series bumped to current majors (`setup-buildx-action v3`, `login-action v3`, `setup-qemu-action v3`, `build-push-action v6`).
- `mikepenz/release-changelog-builder-action v3.4.0 → v5`, `softprops/action-gh-release v1 → v2`.
- Service container images updated: `postgres:13 → postgres:16`, `mariadb:10.11.4 → mariadb:10.11`.
- New CI step: `poetry run ruff check piicatcher tests`.

## Why not Python 3.11+?

PIICatcher is structurally coupled to `dbcat`, a separate Tokern-owned library that provides the catalog substrate (SQLAlchemy models, source registration, schema introspection, the `piicatcher catalog *` subcommands). The latest published `dbcat` (0.15.0) **still requires Python `>=3.8, <=3.10.8`** and **pins SQLAlchemy `<1.4`**. Both upstream repos appear dormant since 2023.

True modern-Python support requires either:
- **Vendoring `dbcat`** into this repo and modernizing it together (estimated multi-session effort).
- **Replacing `dbcat`** with an in-tree minimal catalog built on SQLAlchemy 2.0 (estimated larger effort; may change subtle behavior).

Both are tracked separately. For now, the Python ceiling is honest: **3.10.8**.

## Installing on macOS

The `dbcat` dep chain pulls in `mysqlclient` and `psycopg2` (both compile from source on macOS — no wheels for the pinned versions). You need system client libraries for the build:

```bash
brew install mysql-client libpq openssl@3

# When running `poetry install`, expose them:
export PATH="/opt/homebrew/opt/mysql-client/bin:/opt/homebrew/opt/libpq/bin:$PATH"
export LDFLAGS="-L/opt/homebrew/opt/mysql-client/lib -L/opt/homebrew/opt/openssl@3/lib"
export CPPFLAGS="-I/opt/homebrew/opt/mysql-client/include -I/opt/homebrew/opt/openssl@3/include"

poetry install
```

**Known issue on Apple Silicon Macs with current Xcode (16.x):** `greenlet 2.0.1` (a transitive dep locked by `dbcat`) fails to compile because modern libc++ enforces stricter `static_assert` checks on allocator types than greenlet 2.x emits. This is a `dbcat` pin chain problem; there is no clean workaround without either (a) using an older Xcode SDK, (b) running the install inside a Linux container, or (c) the broader dbcat-modernization work mentioned above. CI on Ubuntu is unaffected.

If you hit this locally, use Docker (the published `tokern/piicatcher` image still works) or wait for the `dbcat` rework.

## Installing on Linux

```bash
# Debian/Ubuntu
sudo apt-get install -y libpq-dev default-libmysqlclient-dev build-essential

# Amazon Linux / RHEL
sudo yum install -y postgresql-devel mysql-devel gcc gcc-c++ python3-devel

poetry install
```

## Public API stability

No source-level changes to the `piicatcher.api` module, the CLI commands, or the
exported PII type classes. Any code that imported `piicatcher.api.scan_database`,
`piicatcher.api.ScanTypeEnum`, `piicatcher.api.OutputFormat`, or the
`piicatcher catalog *` / `piicatcher detect` CLI commands continues to work
unchanged.

Internal: the `python-json-logger` import path inside `piicatcher/command_line.py`
moved from `from pythonjsonlogger import jsonlogger` to
`from pythonjsonlogger.jsonlogger import JsonFormatter`. This is only relevant
if you subclassed or monkey-patched the CLI module.
