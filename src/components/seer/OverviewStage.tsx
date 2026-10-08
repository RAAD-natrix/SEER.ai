import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Block, Bullets, StatusTag } from "@/components/seer/AppShell";
import { Button } from "@/components/ui/button";
import { StateEditor, STATE_LABELS } from "@/components/seer/StateEditor";
import { StageTracker } from "@/components/seer/StageTracker";
import { OwnershipPanel } from "@/components/seer/OwnershipPanel";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB") : "—");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const list = (v: any): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : v ? [String(v)] : []);

export function OverviewStage({ caseId, onGo }: { caseId: string; onGo: (s: "BRIEF" | "RESEARCH" | "SANDBOX" | "OUTCOMES") => void }) {
  const q = useQuery({
    queryKey: ["overview", caseId],
    queryFn: async () => {
      const [briefs, states, paths, sources, ev, outputs, forecasts, runs] = await Promise.all([
        supabase.from("brief_versions").select("id,version,created_at,triage").eq("case_id", caseId).order("version", { ascending: false }),
        supabase.from("strategic_state_versions").select("id,version,created_at,state").eq("case_id", caseId).order("version", { ascending: false }),
        supabase.from("thought_paths").select("id,title,status,updated_at").eq("case_id", caseId),
        supabase.from("sources").select("id", { count: "exact", head: true }).eq("case_id", caseId).is("deleted_at", null),
        supabase.from("evidence_items").select("id", { count: "exact", head: true }).eq("case_id", caseId),
        supabase.from("outputs").select("id,title,status,updated_at").eq("case_id", caseId),
        supabase.from("forecasts").select("id", { count: "exact", head: true }).eq("case_id", caseId),
        supabase.from("ai_runs").select("id,stage,status,model,started_at").eq("case_id", caseId).order("started_at", { ascending: false }).limit(10),
      ]);
      return { briefs: briefs.data ?? [], states: states.data ?? [], paths: paths.data ?? [], sources: sources.count ?? 0, evidence: ev.count ?? 0, outputs: outputs.data ?? [], forecasts: forecasts.count ?? 0, runs: runs.data ?? [] };
    },
  });
  const [editing, setEditing] = useState(false);
  const d = q.data;
  if (!d) return <p className="text-sm text-muted-foreground">Loading case overview…</p>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (d.states[0]?.state ?? null) as any;
  const stages = [
    { k: "BRIEF" as const, done: d.briefs.length > 0, note: `${d.briefs.length} version(s)${d.briefs[0]?.triage ? " · triaged" : " · not triaged"}` },
    { k: "RESEARCH" as const, done: d.sources > 0 || d.evidence > 0, note: `${d.sources} source(s) · ${d.evidence} evidence item(s)` },
    { k: "SANDBOX" as const, done: d.paths.length > 0, note: `${d.paths.length} path(s) · ${d.states.length} state version(s)` },
    { k: "OUTCOMES" as const, done: d.outputs.length > 0, note: `${d.outputs.length} output(s) · ${d.forecasts} forecast(s)` },
  ];
  return (
    <div className="space-y-4">
      <StageTracker caseId={caseId} onGo={onGo} />
      <div className="grid gap-2 md:grid-cols-4">
        {stages.map((st, i) => (
          <button key={st.k} onClick={() => onGo(st.k)} className="seer-panel p-3 text-left hover:border-primary">
            <div className="seer-label">{i + 1} {st.k}</div>
            <div className={`text-sm font-medium ${st.done ? "text-primary" : "text-muted-foreground"}`}>{st.done ? "Started" : "Not started"}</div>
            <div className="text-xs text-muted-foreground">{st.note}</div>
          </button>
        ))}
      </div>
      <div className="seer-panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="seer-label">Current strategic state {d.states[0] ? `· v${d.states[0].version} · ${fmt(d.states[0].created_at)}` : ""}</div>
          {!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{s ? "Edit state" : "Write state"}</Button>}
        </div>
        {editing ? (
          <StateEditor caseId={caseId} current={s} version={d.states[0]?.version ?? 0} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); q.refetch(); }} />
        ) : s ? (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {STATE_LABELS.map(([k, label]) => (list(s[k]).length ? <div key={k}><div className="seer-label">{label}</div><Bullets items={list(s[k])} /></div> : null))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No strategic state saved yet. Write one here, or use Update state (AI) in SANDBOX.</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Versions">
          <table className="w-full text-xs">
            <tbody>
              {d.briefs.map((b) => <tr key={b.id} className="border-b"><td className="py-1">Brief v{b.version}</td><td className="text-muted-foreground">{fmt(b.created_at)}</td></tr>)}
              {d.states.map((b) => <tr key={b.id} className="border-b"><td className="py-1">Strategic state v{b.version}</td><td className="text-muted-foreground">{fmt(b.created_at)}</td></tr>)}
              {d.paths.map((p) => <tr key={p.id} className="border-b"><td className="py-1">Path: {p.title} <StatusTag s={p.status} /></td><td className="text-muted-foreground">{fmt(p.updated_at)}</td></tr>)}
              {d.outputs.map((o) => <tr key={o.id} className="border-b"><td className="py-1">Output: {o.title} <StatusTag s={o.status} /></td><td className="text-muted-foreground">{fmt(o.updated_at)}</td></tr>)}
            </tbody>
          </table>
          {!d.briefs.length && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
        </Block>
        <Block label="Recent AI runs on this case">
          <table className="w-full text-xs">
            <tbody>
              {d.runs.map((r) => <tr key={r.id} className="border-b"><td className="py-1 font-mono">{r.stage}</td><td><StatusTag s={r.status} /></td><td className="text-muted-foreground">{r.model ?? "—"}</td><td className="text-muted-foreground">{fmt(r.started_at)}</td></tr>)}
            </tbody>
          </table>
          {!d.runs.length && <p className="text-sm text-muted-foreground">No AI runs yet.</p>}
        </Block>
      </div>
    </div>
  );
}
