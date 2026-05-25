import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { type PiiFinding } from "@/lib/api";
import { Badge, Card, EmptyState, Input } from "@/components/ui";

const PII_TONES: Record<string, "danger" | "warning" | "brand" | "neutral"> = {
  // High-sensitivity types get red.
  SSN: "danger",
  CreditCard: "danger",
  Password: "danger",
  // Medium.
  Person: "warning",
  Email: "warning",
  Phone: "warning",
  BirthDate: "warning",
  // Lower / location-y.
  Address: "brand",
  ZipCode: "brand",
};

export function ResultsTable({ findings }: { findings: PiiFinding[] }) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return findings;
    const q = filter.toLowerCase();
    return findings.filter(
      (f) =>
        f.schema.toLowerCase().includes(q) ||
        f.table.toLowerCase().includes(q) ||
        f.column.toLowerCase().includes(q) ||
        f.piiType.toLowerCase().includes(q),
    );
  }, [findings, filter]);

  if (findings.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No findings"
          description="The scan completed without detecting any PII columns. Try a data-mode scan if your column names are non-descriptive."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="relative max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by schema, table, column, or PII type…"
            className="pl-8"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <Th>Schema</Th>
              <Th>Table</Th>
              <Th>Column</Th>
              <Th>PII type</Th>
              <Th>Scanner</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((f, i) => (
              <tr key={`${f.schema}.${f.table}.${f.column}.${i}`} className="hover:bg-slate-50">
                <Td>{f.schema}</Td>
                <Td>{f.table}</Td>
                <Td className="font-medium text-slate-900">{f.column}</Td>
                <Td>
                  <Badge tone={PII_TONES[f.piiType] ?? "neutral"}>{f.piiType}</Badge>
                </Td>
                <Td className="text-xs text-slate-500">{f.scanner}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No findings match "{filter}".
          </div>
        )}
      </div>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-3 py-2 text-slate-700 " + (className ?? "")}>{children}</td>;
}
