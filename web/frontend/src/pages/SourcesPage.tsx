import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ipc, type Source } from "@/lib/api";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { AddSourceDialog } from "@/components/AddSourceDialog";

interface Props {
  selectedSource: string | null;
  onSelect: (name: string | null) => void;
}

export function SourcesPage({ selectedSource, onSelect }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: ipc.listSources,
  });

  const removeMut = useMutation({
    mutationFn: (name: string) => ipc.removeSource(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      if (selectedSource === name) onSelect(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Data sources</h2>
          <p className="text-sm text-slate-500">
            Databases registered with piicatcher's catalog. Each one can be scanned for PII.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add source
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-slate-500">Loading sources…</Card>
      ) : sources.length === 0 ? (
        <Card>
          <EmptyState
            title="No sources yet"
            description="Add a SQLite file or connect to a Postgres / MySQL database to get started."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first source
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {sources.map((s) => (
              <SourceRow
                key={s.name}
                source={s}
                selected={selectedSource === s.name}
                onSelect={() => onSelect(s.name)}
                onRemove={() => {
                  if (confirm(`Remove source "${s.name}" from the catalog? This does not delete the database itself.`)) {
                    removeMut.mutate(s.name);
                  }
                }}
              />
            ))}
          </ul>
        </Card>
      )}

      <AddSourceDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function SourceRow({
  source,
  selected,
  onSelect,
  onRemove,
}: {
  source: Source;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={
        "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition " +
        (selected ? "bg-brand-50" : "")
      }
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Database className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{source.name}</p>
          <p className="text-xs text-slate-500 truncate">{source.summary}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone="brand">{source.kind}</Badge>
        <Button
          variant="ghost"
          aria-label={`Remove ${source.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-4 w-4 text-slate-400" />
        </Button>
      </div>
    </li>
  );
}
