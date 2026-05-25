//! Tauri command handlers. Each `#[tauri::command]` corresponds 1:1 with
//! a wrapper in `src/lib/ipc.ts`. Keep the two in sync.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppResult;
use crate::piicatcher::{self, HealthInfo, NetworkSource, ScanRequest, ScanResult, SourceInfo};

// ----- Health -----

#[tauri::command]
pub fn health() -> HealthInfo {
    piicatcher::health()
}

// ----- Sources -----

#[tauri::command]
pub fn list_sources() -> AppResult<Vec<SourceInfo>> {
    piicatcher::list_sources()
}

#[derive(Deserialize)]
pub struct AddSqliteArgs {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn add_sqlite_source(args: AddSqliteArgs) -> AppResult<()> {
    piicatcher::add_sqlite_source(&args.name, &PathBuf::from(args.path))
}

#[derive(Deserialize)]
pub struct AddNetworkArgs {
    pub name: String,
    pub kind: String,
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    pub username: String,
    pub password: String,
    pub database: String,
}

#[tauri::command]
pub fn add_network_source(args: AddNetworkArgs) -> AppResult<()> {
    piicatcher::add_network_source(&NetworkSource {
        name: &args.name,
        kind: &args.kind,
        host: &args.host,
        port: args.port,
        username: &args.username,
        password: &args.password,
        database: &args.database,
    })
}

#[tauri::command]
pub fn remove_source(name: String) -> AppResult<()> {
    piicatcher::remove_source(&name)
}

// ----- Scanning -----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunScanArgs {
    pub source_name: String,
    pub scan_type: String,
    pub incremental: bool,
    pub list_all: bool,
    #[serde(default)]
    pub sample_size: Option<u32>,
    #[serde(default)]
    pub include_schema: Vec<String>,
    #[serde(default)]
    pub exclude_schema: Vec<String>,
}

// All response structs match TS types in src/lib/ipc.ts via camelCase rename.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResultJs {
    pub source: String,
    pub scan_type: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: chrono::DateTime<chrono::Utc>,
    pub findings: Vec<FindingJs>,
    pub columns_scanned: u32,
    pub columns_with_pii: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindingJs {
    pub schema: String,
    pub table: String,
    pub column: String,
    pub pii_type: String,
    pub scanner: String,
}

impl From<ScanResult> for ScanResultJs {
    fn from(r: ScanResult) -> Self {
        Self {
            source: r.source,
            scan_type: r.scan_type,
            started_at: r.started_at,
            finished_at: r.finished_at,
            findings: r
                .findings
                .into_iter()
                .map(|f| FindingJs {
                    schema: f.schema,
                    table: f.table,
                    column: f.column,
                    pii_type: f.pii_type,
                    scanner: f.scanner,
                })
                .collect(),
            columns_scanned: r.columns_scanned,
            columns_with_pii: r.columns_with_pii,
        }
    }
}

#[tauri::command]
pub fn run_scan(args: RunScanArgs) -> AppResult<ScanResultJs> {
    piicatcher::run_scan(&ScanRequest {
        source_name: &args.source_name,
        scan_type: &args.scan_type,
        incremental: args.incremental,
        list_all: args.list_all,
        sample_size: args.sample_size,
        include_schema: &args.include_schema,
        exclude_schema: &args.exclude_schema,
    })
    .map(Into::into)
}

// ----- Dialogs -----

#[tauri::command]
pub async fn pick_sqlite_file(app: tauri::AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("SQLite databases", &["sqlite", "sqlite3", "db", "db3"])
        .add_filter("All files", &["*"])
        .pick_file(move |path| {
            // The callback fires once; ignore if the awaiter has been dropped.
            let _ = tx.send(path);
        });

    rx.await.ok().flatten().map(|fp| fp.to_string())
}
