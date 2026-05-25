import { useMutation } from "@tanstack/react-query";
import { Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { ipc, type ScanResult, type ScanType } from "@/lib/api";
import { Badge, Button, Card, EmptyState, Label, Select } from "@/components/ui";
import { ResultsTable } from "@/components/ResultsTable";

interface Props {
  selectedSource: string | null;
}

export function ScanPage({ selectedSource }: Props) {
  const [scanType, setScanType] = useState<ScanType>("metadata");
  const [incremental, setIncremental] = useState(true);
  const [listAll, setListAll] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const scanMut = useMutation({
    mutationFn: () => {
      if (!selectedSource) throw new Error("No source selected");
      return ipc.runScan({
        sourceName: selectedSource,
        scanType,
        incremental,
        listAll,
      });
    },
    onSuccess: (data) => setResult(data),
  });

  if (!selectedSource) {
    return (
      <Card>
        <EmptyState
          title="Select a source to scan"
          description="Pick a registered data source from the Sources tab to start a PII scan."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500">Source</p>
              <p className="text-sm font-medium text-slate-900">{selectedSource}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <Label htmlFor="scan-type">Scan type</Label>
                <Select
                  id="scan-type"
                  value={scanType}
                  onChange={(e) => setScanType(e.target.value as ScanType)}
                >
                  <option value="metadata">Metadata (column names only)</option>
                  <option value="data">Data (sample values — slower)</option>
                </Select>
              </div>
              <div className="space-y-1 self-end pb-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={incremental}
                    onChange={(e) => setIncremental(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Incremental (skip already-scanned columns)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={listAll}
                    onChange={(e) => setListAll(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Include columns without PII in results
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setResult(null)}
              disabled={!result || scanMut.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Clear
            </Button>
            <Button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
              <Play className="h-4 w-4" />
              {scanMut.isPending ? "Scanning…" : "Run scan"}
            </Button>
          </div>
        </div>

        {scanType === "data" && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Data-mode scans read sample rows from your database. On large warehouses this can be slow
            and (for cloud DBs) cost money.
          </p>
        )}
      </Card>

      {scanMut.isError && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-800">Scan failed</p>
          <pre className="mt-1 text-xs text-red-700 whitespace-pre-wrap break-words">
            {scanMut.error instanceof Error ? scanMut.error.message : String(scanMut.error)}
          </pre>
        </Card>
      )}

      {result && (
        <>
          <Card className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Badge tone="brand">{result.scanType}</Badge>
              <span className="text-slate-600">
                Scanned <strong>{result.columnsScanned.toLocaleString()}</strong> columns
              </span>
              <span className="text-slate-600">
                Found PII in{" "}
                <strong className={result.columnsWithPii > 0 ? "text-amber-700" : "text-emerald-700"}>
                  {result.columnsWithPii.toLocaleString()}
                </strong>{" "}
                columns
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {fmtDuration(result.startedAt, result.finishedAt)}
              </span>
            </div>
          </Card>
          <ResultsTable findings={result.findings} />
        </>
      )}
    </div>
  );
}

function fmtDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
