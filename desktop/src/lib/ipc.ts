// Typed wrappers around Tauri IPC commands. Each function corresponds 1:1 with
// a `#[tauri::command]` defined in src-tauri/src/commands.rs. Keep these in sync.

import { invoke } from "@tauri-apps/api/core";

// ---------- Source types ----------

export type SourceKind =
  | "sqlite"
  | "postgresql"
  | "mysql"
  | "redshift"
  | "snowflake"
  | "athena"
  | "bigquery";

export interface Source {
  name: string;
  kind: SourceKind;
  // For display only — never returns secrets like passwords.
  summary: string;
}

export interface AddSqliteSourceArgs {
  name: string;
  path: string;
}

export interface AddNetworkSourceArgs {
  name: string;
  kind: "postgresql" | "mysql" | "redshift";
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
}

// ---------- Scan types ----------

export type ScanType = "metadata" | "data";

export interface ScanArgs {
  sourceName: string;
  scanType: ScanType;
  incremental: boolean;
  listAll: boolean;
  sampleSize?: number;
  includeSchema?: string[];
  excludeSchema?: string[];
}

export interface PiiFinding {
  schema: string;
  table: string;
  column: string;
  piiType: string;
  scanner: string;
}

export interface ScanResult {
  source: string;
  scanType: ScanType;
  startedAt: string;     // ISO timestamp
  finishedAt: string;
  findings: PiiFinding[];
  // Counts let the UI show "scanned 1,243 columns, found PII in 47" without
  // recomputing client-side.
  columnsScanned: number;
  columnsWithPii: number;
}

// ---------- Health / environment ----------

export interface Health {
  piicatcherFound: boolean;
  piicatcherPath: string | null;
  piicatcherVersion: string | null;
  // Captured so the UI can show a helpful error if piicatcher is missing or
  // the catalog DB hasn't been initialized yet.
  errorMessage: string | null;
}

// ---------- Command wrappers ----------

export const ipc = {
  health: () => invoke<Health>("health"),

  listSources: () => invoke<Source[]>("list_sources"),

  addSqliteSource: (args: AddSqliteSourceArgs) =>
    invoke<void>("add_sqlite_source", { args }),

  addNetworkSource: (args: AddNetworkSourceArgs) =>
    invoke<void>("add_network_source", { args }),

  removeSource: (name: string) =>
    invoke<void>("remove_source", { name }),

  runScan: (args: ScanArgs) =>
    invoke<ScanResult>("run_scan", { args }),

  // Opens the native file picker for SQLite DB selection. Returns null if cancelled.
  pickSqliteFile: () => invoke<string | null>("pick_sqlite_file"),
};
