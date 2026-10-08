import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Tab = "BRIEF" | "RESEARCH" | "SANDBOX" | "OUTCOMES";
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB") : "—");

export const PIPELINE: { stage: string; label: string; tab: Tab }[] = [
  { stage: "BRIEF_TRIAGE", label: "Brief triage", tab: "BRIEF" },
  { stage: "RESEARCH_DELTA", label: "Research analysis", tab: "RESEARCH" },
  { stage: "PATH_DISCUSS", label: "Path discussion", tab: "SANDBOX" },
  { stage: "PATH_REDTEAM", label: "Path Red Team", tab: "SANDBOX" },
  { stage: "STATE_UPDATE", label: "Strategic state update", tab: "SANDBOX" },
  { stage: "DIAGNOSIS", label: "Diagnosis", tab: "SANDBOX" },
  { stage: "OPTIONS_ANALYSIS", label: "Options analysis", tab: "SANDBOX" },
  { stage: "RISK_STAKEHOLDER", label: "Risk & stakeholders", tab: "SANDBOX" },
  { stage: "OUTPUT_DRAFT", label: "Deliverable draft", tab: "OUTCOMES" },
  { stage: "OUTPUT_REDTEAM", label: "Deliverable Red Team", tab: "OUTCOMES" },
  { stage: "OUTPUT_QA", label: "Deliverable QA", tab: "OUTCOMES" },
];

export function StageTracker({ caseId, onGo }: { caseId: string; onGo: (s: Tab) => void }) {
  const q = useQuery({
    queryKey: ["stage-tracker", caseId],
    queryFn: async () => (await supabase.from("ai_runs").select("stage,status,started_at").eq("case_id", caseId).order("started_at", { ascending: false })).data ?? [],
  });
  const runs = q.data ?? [];
  const rows = PIPELINE.map((p) => {
    const mine = runs.filter((r) => r.stage === p.stage);
    const ok = mine.some((r) => r.status === "COMPLETED");
    return { ...p, count: mine.length, done: ok, failed: !ok && mine.some((r) => r.status === "FAILED"), last: mine[0]?.started_at };
  });
  const done = rows.filter((r) => r.done).length;
  const pct = Math.round((done / rows.length) * 100);
  const backlog = rows.filter((r) => !r.done);
  return (
    <div className="seer-panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="seer-label">AI stage progress</div>
        <div className="font-mono text-xs text-muted-foreground">{done}/{rows.length} · {pct}%</div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="seer-label mb-1">Completed</div>
          {rows.filter((r) => r.done).map((r) => <div key={r.stage} className="text-xs"><span className="text-primary">✓</span> {r.label} <span className="text-muted-foreground">· {r.count} run(s) · {fmt(r.last)}</span></div>)}
          {!done && <p className="text-xs text-muted-foreground">No stages completed yet.</p>}
        </div>
        <div>
          <div className="seer-label mb-1">Backlog</div>
          {backlog.map((r) => <button key={r.stage} onClick={() => onGo(r.tab)} className="block text-left text-xs hover:text-primary">○ {r.label} <span className="text-muted-foreground">· {r.failed ? "failed — retry" : "not run"} → {r.tab}</span></button>)}
          {!backlog.length && <p className="text-xs text-muted-foreground">All stages complete.</p>}
        </div>
      </div>
    </div>
  );
}
