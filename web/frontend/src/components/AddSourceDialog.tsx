import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { ipc, type SourceKind } from "@/lib/api";
import { Button, Input, Label, Select } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

type NetworkKind = "postgresql" | "mysql" | "redshift";

const DEFAULT_PORTS: Record<NetworkKind, number> = {
  postgresql: 5432,
  mysql: 3306,
  redshift: 5439,
};

export function AddSourceDialog({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SourceKind>("sqlite");
  const [name, setName] = useState("");
  const [sqlitePath, setSqlitePath] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | "">("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: async () => {
      if (kind === "sqlite") {
        await ipc.addSqliteSource({ name, path: sqlitePath });
      } else if (kind === "postgresql" || kind === "mysql" || kind === "redshift") {
        await ipc.addNetworkSource({
          name,
          kind,
          host,
          port: typeof port === "number" ? port : undefined,
          username,
          password,
          database,
        });
      } else {
        // Snowflake/Athena/BigQuery have different auth shapes and aren't in MVP.
        throw new Error(`${kind} source is not yet supported in the desktop app`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      reset();
      onClose();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  function reset() {
    setKind("sqlite");
    setName("");
    setSqlitePath("");
    setHost("");
    setPort("");
    setUsername("");
    setPassword("");
    setDatabase("");
    setError(null);
  }

  if (!open) return null;

  const showNetworkFields = kind === "postgresql" || kind === "mysql" || kind === "redshift";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-base font-semibold">Add data source</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            addMut.mutate();
          }}
        >
          <div>
            <Label htmlFor="kind">Type</Label>
            <Select
              id="kind"
              value={kind}
              onChange={(e) => {
                const next = e.target.value as SourceKind;
                setKind(next);
                if (next !== "sqlite" && !port) {
                  setPort(DEFAULT_PORTS[next as NetworkKind] ?? "");
                }
              }}
            >
              <option value="sqlite">SQLite (local file)</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
              <option value="redshift">AWS Redshift</option>
              <option value="snowflake" disabled>Snowflake (coming soon)</option>
              <option value="bigquery" disabled>BigQuery (coming soon)</option>
              <option value="athena" disabled>Athena (coming soon)</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="name">Source name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. analytics_prod"
              required
              pattern="[a-zA-Z0-9_-]+"
              title="Letters, digits, underscore, hyphen"
            />
          </div>

          {kind === "sqlite" && (
            <div>
              <Label htmlFor="sqlite-path">SQLite file path (server-side)</Label>
              <Input
                id="sqlite-path"
                value={sqlitePath}
                onChange={(e) => setSqlitePath(e.target.value)}
                placeholder="/var/lib/piicatcher-web/databases/example.sqlite"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Path is resolved on the server, not your browser. For docker-compose deploys,
                mount the directory at <code className="text-slate-700">/var/lib/piicatcher-web</code>.
              </p>
            </div>
          )}

          {showNetworkFields && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder={String(DEFAULT_PORTS[kind as NetworkKind])}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="database">Database</Label>
                <Input id="database" value={database} onChange={(e) => setDatabase(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Credentials are passed to piicatcher and stored encrypted in its local catalog.
              </p>
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addMut.isPending}>
              {addMut.isPending ? "Adding…" : "Add source"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
