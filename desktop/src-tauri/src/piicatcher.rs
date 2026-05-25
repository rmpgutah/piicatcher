//! Thin wrapper around the piicatcher CLI.
//!
//! Resolution order for the executable:
//!   1. `PIICATCHER_BIN` env var (dev escape hatch — point at a venv binary).
//!   2. Bundled sidecar (Tauri's `externalBin`).
//!   3. `piicatcher` on PATH.
//!
//! All commands invoke piicatcher with `--output-format json` and parse stdout.
//! That mode is part of piicatcher's stable CLI contract (see piicatcher.api.OutputFormat).

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Locate the piicatcher executable. Returns the path and whether it was found
/// via the bundled sidecar (so we can show it in the UI).
pub fn resolve_piicatcher_path() -> AppResult<PathBuf> {
    if let Ok(env_path) = std::env::var("PIICATCHER_BIN") {
        let p = PathBuf::from(&env_path);
        if p.exists() {
            return Ok(p);
        }
        return Err(AppError::PiicatcherNotFound(format!(
            "PIICATCHER_BIN points to {} which does not exist",
            env_path
        )));
    }

    // TODO(sidecar): once the sidecar binary is produced by the build pipeline,
    // prefer `<resource_dir>/binaries/piicatcher-<target_triple>` here. For the
    // current MVP we fall through to PATH.

    which::which("piicatcher").map_err(|_| {
        AppError::PiicatcherNotFound(
            "piicatcher not found on PATH and PIICATCHER_BIN is not set".into(),
        )
    })
}

/// Run piicatcher with the given arguments and return parsed JSON stdout.
fn run_json<T: for<'de> Deserialize<'de>>(args: &[&str]) -> AppResult<T> {
    let bin = resolve_piicatcher_path()?;
    let output = Command::new(&bin).args(args).output()?;

    if !output.status.success() {
        return Err(AppError::SubprocessFailed {
            status: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| AppError::ParseFailed(format!("{e}; stdout was: {stdout}")))
}

/// Run piicatcher and return raw stdout. Used for commands that don't return JSON
/// (e.g. catalog add commands which print human messages).
fn run_text(args: &[&str]) -> AppResult<String> {
    let bin = resolve_piicatcher_path()?;
    let output = Command::new(&bin).args(args).output()?;

    if !output.status.success() {
        return Err(AppError::SubprocessFailed {
            status: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

// ----- Health -----

#[derive(Serialize)]
pub struct HealthInfo {
    pub piicatcher_found: bool,
    pub piicatcher_path: Option<String>,
    pub piicatcher_version: Option<String>,
    pub error_message: Option<String>,
}

pub fn health() -> HealthInfo {
    match resolve_piicatcher_path() {
        Ok(path) => {
            let version = Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                    } else {
                        None
                    }
                });
            HealthInfo {
                piicatcher_found: true,
                piicatcher_path: Some(path.display().to_string()),
                piicatcher_version: version,
                error_message: None,
            }
        }
        Err(e) => HealthInfo {
            piicatcher_found: false,
            piicatcher_path: None,
            piicatcher_version: None,
            error_message: Some(e.to_string()),
        },
    }
}

// ----- Catalog source management -----
//
// piicatcher's source list isn't directly exposed via a JSON command in 0.21.x,
// so we shell out to the subcommands and parse what we can. If the underlying
// catalog grows a list-as-json command, replace these with a single JSON call.

#[derive(Serialize)]
pub struct SourceInfo {
    pub name: String,
    pub kind: String,
    pub summary: String,
}

pub fn add_sqlite_source(name: &str, path: &Path) -> AppResult<()> {
    run_text(&[
        "catalog",
        "add-sqlite",
        "--name",
        name,
        "--path",
        path.to_str().ok_or_else(|| AppError::Generic("invalid sqlite path".into()))?,
    ])?;
    Ok(())
}

pub struct NetworkSource<'a> {
    pub name: &'a str,
    pub kind: &'a str, // "postgresql", "mysql", "redshift"
    pub host: &'a str,
    pub port: Option<u16>,
    pub username: &'a str,
    pub password: &'a str,
    pub database: &'a str,
}

pub fn add_network_source(src: &NetworkSource) -> AppResult<()> {
    let subcommand = match src.kind {
        "postgresql" => "add-postgresql",
        "mysql" => "add-mysql",
        "redshift" => "add-redshift",
        other => {
            return Err(AppError::Generic(format!(
                "unsupported network source kind: {other}"
            )))
        }
    };

    let mut args: Vec<String> = vec![
        "catalog".into(),
        subcommand.into(),
        "--name".into(),
        src.name.into(),
        "--uri".into(),
        src.host.into(),
        "--username".into(),
        src.username.into(),
        "--password".into(),
        src.password.into(),
        "--database".into(),
        src.database.into(),
    ];
    if let Some(p) = src.port {
        args.push("--port".into());
        args.push(p.to_string());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_text(&arg_refs)?;
    Ok(())
}

pub fn remove_source(name: &str) -> AppResult<()> {
    run_text(&["catalog", "remove", "--source-name", name])?;
    Ok(())
}

pub fn list_sources() -> AppResult<Vec<SourceInfo>> {
    // piicatcher 0.21 / dbcat 0.15 doesn't expose a stable JSON source-list.
    // We do a best-effort parse of `catalog list --output-format json` which,
    // depending on the dbcat version, returns either a JSON array of source
    // records OR a tabular string. We try JSON first; if that fails, return
    // an empty list and let the user re-add — this is a known limitation
    // documented in the README.
    let output = run_text(&[
        "--output-format",
        "json",
        "catalog",
        "list",
    ])
    .unwrap_or_default();

    if output.trim().is_empty() {
        return Ok(vec![]);
    }

    // Try parsing as `[ { "name": ..., "source_type": ..., "uri": ... }, ... ]`
    #[derive(Deserialize)]
    struct DbcatSource {
        name: String,
        source_type: String,
        #[serde(default)]
        uri: Option<String>,
        #[serde(default)]
        database: Option<String>,
    }

    let parsed: Result<Vec<DbcatSource>, _> = serde_json::from_str(&output);
    match parsed {
        Ok(items) => Ok(items
            .into_iter()
            .map(|s| {
                let summary = match (&s.uri, &s.database) {
                    (Some(uri), Some(db)) => format!("{uri} / {db}"),
                    (Some(uri), None) => uri.clone(),
                    (None, Some(db)) => db.clone(),
                    _ => "—".to_string(),
                };
                SourceInfo {
                    name: s.name,
                    kind: s.source_type,
                    summary,
                }
            })
            .collect()),
        Err(_) => Ok(vec![]),
    }
}

// ----- Scanning -----

pub struct ScanRequest<'a> {
    pub source_name: &'a str,
    pub scan_type: &'a str, // "metadata" | "data"
    pub incremental: bool,
    pub list_all: bool,
    pub sample_size: Option<u32>,
    pub include_schema: &'a [String],
    pub exclude_schema: &'a [String],
}

#[derive(Serialize)]
pub struct PiiFinding {
    pub schema: String,
    pub table: String,
    pub column: String,
    pub pii_type: String,
    pub scanner: String,
}

#[derive(Serialize)]
pub struct ScanResult {
    pub source: String,
    pub scan_type: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: chrono::DateTime<chrono::Utc>,
    pub findings: Vec<PiiFinding>,
    pub columns_scanned: u32,
    pub columns_with_pii: u32,
}

pub fn run_scan(req: &ScanRequest) -> AppResult<ScanResult> {
    let started_at = chrono::Utc::now();

    let mut args: Vec<String> = vec![
        "--output-format".into(),
        "json".into(),
        "detect".into(),
        "--source-name".into(),
        req.source_name.into(),
        "--scan-type".into(),
        req.scan_type.into(),
    ];
    args.push(if req.incremental { "--incremental".into() } else { "--no-incremental".into() });
    if req.list_all {
        args.push("--list-all".into());
    }
    if let Some(size) = req.sample_size {
        args.push("--sample-size".into());
        args.push(size.to_string());
    }
    for s in req.include_schema {
        args.push("--include-schema".into());
        args.push(s.clone());
    }
    for s in req.exclude_schema {
        args.push("--exclude-schema".into());
        args.push(s.clone());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    // piicatcher's JSON output for `detect` is a list of [schema, table, column, pii_type, scanner] arrays.
    let rows: Vec<(String, String, String, String, String)> = run_json(&arg_refs)?;

    let columns_scanned = rows.len() as u32;
    let findings: Vec<PiiFinding> = rows
        .into_iter()
        .filter(|(_, _, _, t, _)| !t.is_empty() && t != "null")
        .map(|(schema, table, column, pii_type, scanner)| PiiFinding {
            schema,
            table,
            column,
            // piicatcher emits "PiiTypes.EMAIL" style identifiers; strip the prefix for display.
            pii_type: pii_type
                .strip_prefix("PiiTypes.")
                .unwrap_or(&pii_type)
                .to_string(),
            scanner,
        })
        .collect();

    let columns_with_pii = findings.len() as u32;
    let finished_at = chrono::Utc::now();

    Ok(ScanResult {
        source: req.source_name.to_string(),
        scan_type: req.scan_type.to_string(),
        started_at,
        finished_at,
        findings,
        columns_scanned,
        columns_with_pii,
    })
}
