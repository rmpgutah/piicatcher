import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ipc } from "@/lib/api";

// Shown across the top of every page. If piicatcher is missing or broken, we
// want the user to know IMMEDIATELY — every other action will fail otherwise.
export function HealthBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: ipc.health,
    // Re-check every 30s in case the user installs piicatcher mid-session.
    refetchInterval: 30_000,
  });

  if (isLoading) return null;

  if (!data?.piicatcherFound) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>piicatcher not available.</strong>{" "}
          {data?.errorMessage ?? "The server could not import or initialize piicatcher."}{" "}
          See the web/README.md for setup and troubleshooting.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-1.5 text-xs text-emerald-700 flex items-center gap-2">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>
        piicatcher {data.piicatcherVersion ?? "(unknown version)"} ready
        {data.piicatcherPath && <span className="ml-1 text-emerald-600/70">— {data.piicatcherPath}</span>}
      </span>
    </div>
  );
}
