import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { uid, useStage } from "@/lib/seer/client";

// Runs the case-level DIAGNOSIS, OPTIONS_ANALYSIS and RISK_STAKEHOLDER stages and saves their results.
export function AnalysisPanel({ caseId, activePathId }: { caseId: string; activePathId: string | null }) {
  const { run, busy } = useStage();
  const qc = useQueryClient();
  const counts = useQuery({
    queryKey: ["analysis-counts", caseId],
    queryFn: async () => {
      const [o, r, s, p] = await Promise.all([
        supabase.from("options").select("id", { count: "exact", head: true }).eq("case_id", caseId),
        supabase.from("risks").select("id", { count: "exact", head: true }).eq("case_id", caseId),
        supabase.from("stakeholders").select("id", { count: "exact", head: true }).eq("case_id", caseId),
        activePathId ? supabase.from("thought_paths").select("detail").eq("id", activePathId).single() : Promise.resolve({ data: null }),
      ]);
      return { options: o.count ?? 0, risks: r.count ?? 0, stakeholders: s.count ?? 0, diagnosis: !!(p.data?.detail as Record<string, unknown> | null)?.["diagnosis"] };
    },
  });
  const done = () => { counts.refetch(); qc.invalidateQueries({ queryKey: ["paths-full", caseId] }); qc.invalidateQueries({ queryKey: ["bundle", caseId] }); qc.invalidateQueries({ queryKey: ["stage-tracker", caseId] }); };

  async function diagnosis() {
    if (!activePathId) { toast.error("Select a thought path first."); return; }
    const r = await run({ stage: "DIAGNOSIS", caseId, pathId: activePathId });
    if (!r) return;
    const { data: p } = await supabase.from("thought_paths").select("detail").eq("id", activePathId).single();
    const { error } = await supabase.from("thought_paths").update({ detail: { ...((p?.detail ?? {}) as Record<string, unknown>), diagnosis: r.output } as never }).eq("id", activePathId);
    if (error) toast.error(error.message); else toast.success("Diagnosis saved to the active path.");
    done();
  }
  async function options() {
    const r = await run({ stage: "OPTIONS_ANALYSIS", caseId, ...(activePathId ? { pathId: activePathId } : {}) });
    if (!r) return;
    const owner = await uid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((r.output as any).options ?? []).map((o: any) => ({ owner_id: owner, case_id: caseId, label: o.label, description: o.description, assumptions: o.assumptions, switching_conditions: o.switching_conditions, hard_constraint_fail: !!o.hard_constraint_fail }));
    const { error } = rows.length ? await supabase.from("options").insert(rows) : { error: null };
    if (error) toast.error(error.message); else toast.success(`${rows.length} options saved.`);
    done();
  }
  async function risks() {
    const r = await run({ stage: "RISK_STAKEHOLDER", caseId, ...(activePathId ? { pathId: activePathId } : {}) });
    if (!r) return;
    const owner = await uid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = r.output as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rk = (out.risks ?? []).map((x: any) => ({ ...x, risk_owner: x.risk_owner || null, owner_id: owner, case_id: caseId, path_id: activePathId }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (out.stakeholders ?? []).map((x: any) => ({ ...x, owner_id: owner, case_id: caseId }));
    const e1 = rk.length ? (await supabase.from("risks").insert(rk)).error : null;
    const e2 = st.length ? (await supabase.from("stakeholders").insert(st)).error : null;
    if (e1 || e2) toast.error((e1 ?? e2)!.message); else toast.success(`${rk.length} risks and ${st.length} stakeholders saved.`);
    done();
  }

  const c = counts.data;
  return (
    <div className="seer-panel space-y-2 p-3">
      <div className="seer-label">Case analysis</div>
      <div className="flex items-center justify-between gap-2 text-xs"><span>Diagnosis {c?.diagnosis ? "✓" : "—"}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={diagnosis}>{busy === "DIAGNOSIS" ? "Running…" : "Run diagnosis"}</Button></div>
      <div className="flex items-center justify-between gap-2 text-xs"><span>Options {c?.options ?? 0}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={options}>{busy === "OPTIONS_ANALYSIS" ? "Running…" : "Run options"}</Button></div>
      <div className="flex items-center justify-between gap-2 text-xs"><span>Risks {c?.risks ?? 0} · Stakeholders {c?.stakeholders ?? 0}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={risks}>{busy === "RISK_STAKEHOLDER" ? "Running…" : "Run risks"}</Button></div>
    </div>
  );
}
