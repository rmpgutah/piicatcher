import { Database, ScanSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { HealthBanner } from "@/components/HealthBanner";
import { SourcesPage } from "@/pages/SourcesPage";
import { ScanPage } from "@/pages/ScanPage";
import { cn } from "@/lib/utils";

type Tab = "sources" | "scan";

export default function App() {
  const [tab, setTab] = useState<Tab>("sources");
  // Source selection is lifted to App so it survives tab switches — that's the
  // expected UX: "I picked a source, now let me go scan it."
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col">
      <HealthBanner />
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar tab={tab} onTab={setTab} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {tab === "sources" && (
            <SourcesPage
              selectedSource={selectedSource}
              onSelect={(name) => {
                setSelectedSource(name);
                if (name) setTab("scan");
              }}
            />
          )}
          {tab === "scan" && <ScanPage selectedSource={selectedSource} />}
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3">
      <ShieldCheck className="h-5 w-5 text-brand-600" />
      <div>
        <h1 className="text-base font-semibold text-slate-900 leading-tight">PIICatcher</h1>
        <p className="text-xs text-slate-500 leading-tight">Find PII and PHI in your databases</p>
      </div>
    </header>
  );
}

interface SidebarProps {
  tab: Tab;
  onTab: (t: Tab) => void;
}

function Sidebar({ tab, onTab }: SidebarProps) {
  return (
    <nav className="w-48 border-r border-slate-200 bg-white py-4 px-2 space-y-1 shrink-0">
      <SidebarItem icon={<Database className="h-4 w-4" />} label="Sources" active={tab === "sources"} onClick={() => onTab("sources")} />
      <SidebarItem icon={<ScanSearch className="h-4 w-4" />} label="Scan" active={tab === "scan"} onClick={() => onTab("scan")} />
    </nav>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition",
        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
