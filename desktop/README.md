# PIICatcher Desktop

A native desktop GUI for [piicatcher](../README.md) — register data sources, run PII/PHI scans, and review findings without leaving your machine.

Built with [Tauri 2](https://tauri.app), React, TypeScript, and Tailwind. The Rust shell spawns the `piicatcher` CLI as a subprocess and parses its JSON output.

## Status

**MVP scaffold.** The UI, IPC layer, and Rust subprocess wrapper are in place. End-to-end verification on this development machine is **blocked by a pre-existing piicatcher install issue** — see [Known issues](#known-issues) below.

What works (verified by reading the code, not by running):
- Tauri project structure, Vite + React + Tailwind build pipeline.
- Rust commands for adding/removing sources, running scans, and a health probe.
- React UI with Sources / Scan tabs, source picker for SQLite + form for Postgres/MySQL/Redshift.
- Sidecar bundling **scripted** (`scripts/build-piicatcher-sidecar.sh`) but unverified — needs a working piicatcher install to execute.

What's deliberately deferred to follow-up sessions:
- Actually running `tauri dev` end-to-end and exercising a scan.
- Producing a working PyInstaller-bundled sidecar (gated by the piicatcher install issue).
- Snowflake / BigQuery / Athena source forms (they have non-trivial auth flows).
- A stable JSON `catalog list` command in piicatcher — see [list_sources gap](#known-issues).

## Prerequisites

- **Node** ≥ 20 and **pnpm** ≥ 9.
- **Rust** ≥ 1.77 (`rustup` recommended).
- **macOS:** Xcode Command Line Tools. On Linux: `webkit2gtk-4.1`, `libssl-dev`, `build-essential` etc. — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- **piicatcher** installed somewhere the app can find. Either:
  - `pip install piicatcher` into a Python 3.10 environment and put it on PATH, OR
  - set `PIICATCHER_BIN=/path/to/piicatcher` before launching the app.

## Development

```bash
cd desktop
pnpm install
pnpm tauri:dev
```

This runs the Vite dev server on port 1420 and launches the Tauri window. Edits to `src/` hot-reload; edits to `src-tauri/` trigger a Rust rebuild.

### Pointing at a non-default piicatcher

```bash
export PIICATCHER_BIN=/path/to/your/venv/bin/piicatcher
pnpm tauri:dev
```

The Rust shell resolves piicatcher in this order:

1. `$PIICATCHER_BIN` env var, if set.
2. (Future) Bundled sidecar at `<resources>/binaries/piicatcher-<triple>`.
3. `piicatcher` on PATH.

If none resolve, the UI's `HealthBanner` shows a red error with the underlying reason.

## Production build

The desktop app's production bundle has two parts:

1. **The Rust+web shell**, produced by `pnpm tauri:build`.
2. **The piicatcher sidecar binary**, produced by `scripts/build-piicatcher-sidecar.sh`.

For a fully self-contained release, both must be assembled and the sidecar must be declared in `tauri.conf.json`. To keep `cargo check` / `tauri dev` working out-of-the-box without a piicatcher install, **the `externalBin` declaration is intentionally absent from `tauri.conf.json` in the committed config**. You enable it before building a release:

```bash
# 1. Build the sidecar (in a Python 3.10 venv with piicatcher installed)
bash scripts/build-piicatcher-sidecar.sh
# → produces src-tauri/binaries/piicatcher-<target-triple>

# 2. Re-enable sidecar bundling in src-tauri/tauri.conf.json by adding
#    inside the "bundle" block:
#
#      "externalBin": ["binaries/piicatcher"]

# 3. Build the desktop app
pnpm tauri:build
```

The script uses PyInstaller to produce a single-file binary at `src-tauri/binaries/piicatcher-<target-triple>`.

## Architecture

```
desktop/
├── src/                      React + TS frontend (Vite)
│   ├── App.tsx               Sidebar + tab layout
│   ├── components/
│   │   ├── ui.tsx            Tiny set of Tailwind primitives (Button, Card, …)
│   │   ├── HealthBanner.tsx  Top-of-app piicatcher status indicator
│   │   ├── AddSourceDialog   SQLite picker + network DB form
│   │   └── ResultsTable      Filterable findings table
│   ├── pages/
│   │   ├── SourcesPage       List + manage registered sources
│   │   └── ScanPage          Run a scan + show results
│   └── lib/
│       ├── ipc.ts            Typed wrappers around `invoke(...)` — IPC contract
│       └── utils.ts          cn() classname helper
│
└── src-tauri/                Rust shell
    ├── src/
    │   ├── lib.rs            Tauri builder + plugin registration
    │   ├── main.rs           Entry point (delegates to lib::run)
    │   ├── commands.rs       #[tauri::command] handlers (1:1 with ipc.ts)
    │   ├── piicatcher.rs     Subprocess wrapper — resolves & invokes piicatcher
    │   └── error.rs          AppError serialized as a string for the UI
    ├── capabilities/         Tauri v2 permission model
    ├── icons/                Placeholder icons (replace before release)
    ├── tauri.conf.json       Window, bundle, sidecar config
    └── Cargo.toml
```

### IPC contract

The Rust ↔ TypeScript boundary lives in two files that **must be kept in sync**:

| TypeScript | Rust |
|---|---|
| [`src/lib/ipc.ts`](src/lib/ipc.ts) | [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs) |

Every TS function in `ipc.ts` matches a `#[tauri::command]` in `commands.rs` by name. Argument and response structs use `#[serde(rename_all = "camelCase")]` so the Rust snake_case maps to TS camelCase.

If you change one side, change the other in the same commit.

## Known issues

### 1. piicatcher won't install on Apple Silicon with current Xcode (16.x)

`piicatcher` transitively pins `greenlet 2.0.1` via `dbcat`'s `greenlet <3` constraint. greenlet 2.0.1 uses C++ allocator patterns that modern libc++ rejects with `static_assert` errors. There is no clean local workaround. Options:

- **Docker:** run the `tokern/piicatcher` Docker image and point `PIICATCHER_BIN` at a shell wrapper that proxies into the container. (See: [follow-up issue].)
- **Linux dev box:** install piicatcher on Linux where the build succeeds.
- **Wait for dbcat modernization:** the larger piicatcher modernization effort to vendor or replace `dbcat` (separate work) will lift this constraint.

Until one of those is in place, the desktop app builds and runs, but the `HealthBanner` shows "piicatcher not found" and scans cannot execute.

### 2. `list_sources` has a graceful-degradation hack

piicatcher 0.21 / dbcat 0.15 does not expose a stable JSON `catalog list` command. The Rust `list_sources` impl tries to parse `piicatcher --output-format json catalog list` and silently returns an empty list on failure. As a result, sources you add may not appear in the UI until either piicatcher gains the command or the desktop app starts reading dbcat's SQLite catalog directly.

This is a real gap. It is documented in [`src-tauri/src/piicatcher.rs`](src-tauri/src/piicatcher.rs) at `list_sources` with a TODO.

### 3. Sidecar bundling is scripted but unverified

`scripts/build-piicatcher-sidecar.sh` should work once piicatcher is installed locally. It has not been verified end-to-end because of issue #1. The PyInstaller config includes the obvious `--collect-submodules` for `dbcat` and `piicatcher`, but additional hidden imports may surface (snowflake, pyathena, alembic migrations, etc.) on first real run.

### 4. Production CSP is permissive

`tauri.conf.json` sets `security.csp` to `null` for dev convenience. Before any production release, replace this with a strict CSP allowing only `tauri://localhost` and your own bundled assets.

### 5. Icons are placeholders

`src-tauri/icons/*.png` are 32/128/256 px flat teal squares. Replace with real icons (and add `.icns` for macOS, `.ico` for Windows) before release. `cargo tauri icon path/to/source.png` will generate all platform variants from one source.

## Roadmap

In rough order of usefulness, none of these blocked on each other:

1. Resolve issue #1 (piicatcher install) so we can actually run `tauri dev`.
2. Add a "Scan history" tab that reads from the dbcat catalog DB.
3. CSV / JSON export of scan results.
4. Detector plugin manager (install/disable spaCy, future Presidio integration).
5. Schema/table include/exclude regex UI.
6. Snowflake / BigQuery / Athena auth flows.
7. Switch Rust spawn from `std::process::Command` to `app.shell().sidecar()` for better cross-platform behavior.
