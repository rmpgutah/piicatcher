// HTTP client. Wire-compatible with the desktop app's lib/ipc.ts module — same
// exported `ipc` object, same method shapes — so the React components are
// reused without modification. The desktop variant calls Tauri's `invoke()`;
// this one calls fetch() against the FastAPI service.

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

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
  startedAt: string;
  finishedAt: string;
  findings: PiiFinding[];
  columnsScanned: number;
  columnsWithPii: number;
}

// ---------- Health ----------

export interface Health {
  piicatcherFound: boolean;
  piicatcherPath: string | null;
  piicatcherVersion: string | null;
  errorMessage: string | null;
}

// ---------- HTTP helpers ----------

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    // FastAPI's HTTPException body is { detail: "..." }; fall back to status text.
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // body wasn't JSON; keep the status text
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

// ---------- ipc surface (kept named `ipc` for component compatibility) ----------

export const ipc = {
  health: () => request<Health>("/health"),

  listSources: () => request<Source[]>("/sources"),

  addSqliteSource: (args: AddSqliteSourceArgs) =>
    request<void>("/sources/sqlite", { method: "POST", body: JSON.stringify(args) }),

  addNetworkSource: (args: AddNetworkSourceArgs) =>
    request<void>("/sources/network", { method: "POST", body: JSON.stringify(args) }),

  removeSource: (name: string) =>
    request<void>(`/sources/${encodeURIComponent(name)}`, { method: "DELETE" }),

  runScan: (args: ScanArgs) =>
    request<ScanResult>("/scans", { method: "POST", body: JSON.stringify(args) }),

  // Native file picker is unavailable in the browser. We return null so the
  // dialog falls back to a manual path input (the user types the server-side
  // path to the SQLite file — same as how you'd do it via `piicatcher catalog
  // add-sqlite --path ...` on the CLI).
  pickSqliteFile: async (): Promise<string | null> => null,
};
