import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Block, Bullets, StatusTag } from "./AppShell";
import { RedTeamView } from "./SandboxStage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATES, templateByKey } from "@/lib/seer/templates";
import { loadCaseBundle, readinessFor } from "@/lib/seer/caseData";
import { deliverableMarkdown, exportDocx, exportJSON, exportMarkdown, exportPdf } from "@/lib/seer/export";
import { audit, uid, useStage } from "@/lib/seer/client";
import type { Tables } from "@/integrations/supabase/types";

export function OutcomesStage({ caseId }: { caseId: string }) {
  const [tab, setTab] = useState<"deliverables" | "results">("deliverables");
  return (
    <div>
      <div className="mb-4 flex gap-1">
        {(["deliverables", "results"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded border px-3 py-1 font-mono text-xs ${tab === t ? "border-primary text-primary" : "text-muted-foreground"}`}>{t === "deliverables" ? "DELIVERABLES" : "RESULTS & LEARNING"}</button>)}
      </div>
      {tab === "deliverables" ? <Deliverables caseId={caseId} /> : <Results caseId={caseId} />}
    </div>
  );
}

function Deliverables({ caseId }: { caseId: string }) {
  const { run, busy } = useStage();
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [recommend, setRecommend] = useState<{ keys: string[]; rationale: string } | null>(null);
  const bundle = useQuery({ queryKey: ["bundle", caseId], queryFn: () => loadCaseBundle(caseId) });
  const outputs = useQuery({ queryKey: ["outputs", caseId], queryFn: async () => (await supabase.from("outputs").select("*").eq("case_id", caseId).order("created_at", { ascending: false })).data ?? [] });
  const o = outputs.data?.find((x) => x.id === sel);
  const versions = useQuery({ queryKey: ["ov", sel], enabled: !!sel, queryFn: async () => (await supabase.from("output_versions").select("*").eq("output_id", sel!).order("version", { ascending: false })).data ?? [] });
  const b = bundle.data;

  async function create(key: string) {
    if (!b) return;
    const t = templateByKey(key)!;
    const readiness = readinessFor(b, key);
    const r = await run({ stage: "OUTPUT_DRAFT", caseId, extra: { template_key: key, readiness } });
    if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = r.output as any;
    const owner = await uid();
    const { data, error } = await supabase.from("outputs").insert({ owner_id: owner, case_id: caseId, template_key: key, title: `${t.name} — ${b.case?.title}`, content: out.markdown, readiness: readiness as never, status: "NOT READY" }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("output_versions").insert({ owner_id: owner, output_id: data.id, version: 1, content: out.markdown, status: "NOT READY" });
    setSel(data.id);
    outputs.refetch();
  }

  async function recompute(out: Tables<"outputs">, patch: Partial<Tables<"outputs">> = {}) {
    const fresh = await loadCaseBundle(caseId);
    const merged = { ...out, ...patch };
    const rd = readinessFor(fresh, merged.template_key, merged.redteam as { fatal?: string[] } | null, !!merged.approved_at);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qa = merged.qa as any;
    const qaFails = qa?.checks?.some((c: { pass: boolean }) => !c.pass) || qa?.duplication_found;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = merged.redteam as any;
    let status = "NOT READY";
    if (merged.redteam && merged.qa) status = rd.blockers.length || qaFails || rt?.fatal?.length ? "READY SUBJECT TO CORRECTIONS" : "READY FOR OWNER APPROVAL";
    if (merged.approved_at && rd.canBeFinal && !qaFails && !rt?.fatal?.length) status = "FINAL — OWNER APPROVED";
    const { data: saved, error } = await supabase.from("outputs").update({ ...patch, readiness: rd as never, status }).eq("id", out.id).eq("version", out.version).eq("content", out.content).select("id").maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (!saved) { toast.error("Deliverable changed. Reload and review the latest version."); outputs.refetch(); return null; }
    outputs.refetch(); bundle.refetch();
    return status;
  }

  async function saveEdit() {
    if (!o || edit === null) return;
    const { error } = await supabase.rpc("save_output_version", { _output_id: o.id, _expected_version: o.version, _content: edit, _reason: "Edited in Outcomes" });
    if (error) { toast.error(error.message); return; }
    outputs.refetch(); bundle.refetch();
    setEdit(null);
    versions.refetch();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rd = o?.readiness as any;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        <div className="seer-panel p-3">
          <div className="mb-2 flex items-center justify-between"><div className="seer-label">Output registry</div>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await run({ stage: "OUTPUT_SELECT", caseId }); if (r) setRecommend({ keys: (r.output["recommended_keys"] as string[]) ?? [], rationale: String(r.output["rationale"] ?? "") }); }}>Recommend</Button>
          </div>
          {recommend && <p className="mb-2 text-xs text-muted-foreground">{recommend.rationale}</p>}
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {TEMPLATES.map((t) => {
              const ri = b ? readinessFor(b, t.key).index : 0;
              return (
                <div key={t.key} className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${recommend?.keys.includes(t.key) ? "border border-primary" : ""}`}>
                  <div className="min-w-0"><div className="truncate text-sm">{t.name}</div><div className="seer-label">{t.depth} · readiness {ri}</div></div>
                  <Button size="sm" variant="ghost" disabled={!!busy || !b} onClick={() => create(t.key)}>Draft</Button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="seer-panel divide-y">
          {outputs.data?.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`block w-full px-3 py-2 text-left ${sel === x.id ? "bg-secondary" : ""}`}>
              <div className="truncate text-sm">{x.title}</div><div className="mt-1"><StatusTag s={x.status} /> <span className="seer-label">v{x.version}</span></div>
            </button>
          ))}
          {!outputs.data?.length && <p className="p-3 text-sm text-muted-foreground">No deliverables yet.</p>}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {busy === "OUTPUT_DRAFT" && <p className="seer-label">Drafting…</p>}
        {o && (
          <>
            <div className="seer-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-medium">{o.title}</h2>
                <StatusTag s={o.status !== "FINAL — OWNER APPROVED" && ((o.redteam as { material?: string[] } | null)?.material?.length ?? 0) > 0 ? "READY SUBJECT TO CORRECTIONS" : o.status} />
                <Link to="/deliverable/$outputId" params={{ outputId: o.id }} className="rounded border border-primary px-2 py-1 text-xs text-primary">Open final deliverable screen →</Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await run({ stage: "OUTPUT_REDTEAM", caseId, outputId: o.id }); if (r) recompute(o, { redteam: r.output as never }); }}>Run Red Team</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await run({ stage: "OUTPUT_QA", caseId, outputId: o.id }); if (r) recompute(o, { qa: r.output as never }); }}>Run QA</Button>
                <Button size="sm" variant="outline" onClick={() => setEdit(o.content)}>Edit</Button>
                <Button size="sm" disabled={o.status !== "READY FOR OWNER APPROVAL" || ((o.redteam as { material?: string[] } | null)?.material?.length ?? 0) > 0} onClick={async () => { const status = await recompute(o, { approved_at: new Date().toISOString() }); if (status === "FINAL — OWNER APPROVED") await audit("OUTPUT_FINAL_APPROVAL", "output", o.id); }}>Approve as FINAL</Button>
                <span className="mx-1 border-l" />
                <Button size="sm" variant="ghost" onClick={() => { exportMarkdown(o.title, deliverableMarkdown(o)); audit("EXPORT", "output", o.id, { format: "md" }); }}>MD</Button>
                <Button size="sm" variant="ghost" onClick={() => { exportJSON(o.title, { ...o, footer: "Generated using SEER.ai" }); audit("EXPORT", "output", o.id, { format: "json" }); }}>JSON</Button>
                <Button size="sm" variant="ghost" onClick={async () => { try { await exportDocx(o.title, deliverableMarkdown(o)); await audit("EXPORT", "output", o.id, { format: "docx" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } }}>DOCX</Button>
                <Button size="sm" variant="ghost" onClick={async () => { try { await exportPdf(o.title, deliverableMarkdown(o)); await audit("EXPORT", "output", o.id, { format: "pdf" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } }}>PDF</Button>
              </div>
              {(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const x = o as any;
                const steps = [
                  ["Drafted", true],
                  ["Red Team run", !!x.redteam],
                  ["QA run", !!x.qa],
                  ["Ready for approval", o.status === "READY FOR OWNER APPROVAL" || o.status === "FINAL — OWNER APPROVED"],
                  ["Approved as FINAL deliverable", o.status === "FINAL — OWNER APPROVED"],
                ] as const;
                return (
                  <ol className="mt-3 flex flex-wrap gap-2 text-xs">
                    {steps.map(([l, ok], i) => <li key={l} className={`rounded border px-2 py-1 ${ok ? "border-primary text-primary" : "text-muted-foreground"}`}>{ok ? "✓" : i + 1} {l}</li>)}
                  </ol>
                );
              })()}
              {o.status === "FINAL — OWNER APPROVED" && <p className="mt-2 text-sm text-primary">This is a final, owner-approved deliverable. Download it as DOCX or PDF above.</p>}
              {o.status !== "READY FOR OWNER APPROVAL" && o.status !== "FINAL — OWNER APPROVED" && <p className="mt-2 text-xs text-muted-foreground">FINAL requires Red Team and QA with no fatal issues, no readiness blockers, and your approval.</p>}
            </div>
            {rd && (
              <div className="seer-panel p-4">
                <div className="flex items-baseline gap-3"><div className="seer-label">READINESS INDEX</div><div className="text-2xl font-semibold text-primary">{rd.index}</div><div className="text-xs text-muted-foreground">raw {rd.raw} · not a probability the strategy is correct</div></div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {rd.components?.map((c: { key: string; label: string; score: number; weight: number }) => <div key={c.key} className="flex justify-between text-xs"><span>{c.label}</span><span className="font-mono">{c.score}/{c.weight}</span></div>)}
                </div>
                {rd.blockers?.length > 0 && <div className="mt-2"><div className="seer-label text-destructive">Blockers</div><ul className="list-disc pl-5 text-xs">{rd.blockers.map((x: { label: string; cap: number }) => <li key={x.label}>{x.label} — max {x.cap}</li>)}</ul></div>}
              </div>
            )}
            {edit !== null ? (
              <div className="seer-panel space-y-2 p-4"><Textarea rows={24} value={edit} onChange={(e) => setEdit(e.target.value)} /><div className="flex gap-2"><Button size="sm" onClick={saveEdit}>Save new version</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div></div>
            ) : (
              <div className="seer-panel seer-prose p-5 text-sm"><ReactMarkdown>{deliverableMarkdown(o)}</ReactMarkdown></div>
            )}
            {o.redteam && <div className="seer-panel space-y-2 p-4"><div className="seer-label">Red Team</div><RedTeamView r={o.redteam} /></div>}
            {o.qa && (
              <div className="seer-panel p-4">
                <div className="seer-label mb-1">Quality gate</div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {((o.qa as any).checks ?? []).map((c: { test: string; pass: boolean; note: string }, i: number) => <div key={i} className="text-sm"><span className={c.pass ? "text-primary" : "text-destructive"}>{c.pass ? "PASS" : "FAIL"}</span> {c.test} <span className="text-muted-foreground">— {c.note}</span></div>)}
              </div>
            )}
            <div className="seer-panel p-3"><div className="seer-label mb-1">Versions</div>{versions.data?.map((v) => <div key={v.id} className="text-xs text-muted-foreground">v{v.version} · {v.status} · {new Date(v.created_at).toLocaleString("en-GB")}</div>)}</div>
          </>
        )}
      </div>
    </div>
  );
}

const F_FIELDS: [string, string][] = [["expected_result", "Expected result"], ["baseline", "Baseline"], ["population", "Population/scope"], ["metric", "Metric"], ["unit", "Unit"], ["horizon", "Time horizon"], ["assumptions", "Assumptions"], ["conditions", "Stop/revise/scale conditions"]];
const O_FIELDS: [string, string][] = [["actual_result", "Actual result"], ["evidence", "Evidence"], ["fidelity", "Implementation fidelity"], ["external_changes", "External changes"], ["attribution_limits", "Attribution limits"], ["adoption", "Decision adopted (fully/partly/not)"], ["seer_wrong", "What SEER initially got wrong"], ["seer_understood", "What SEER eventually understood"], ["owner_changed", "What the owner changed"], ["retain", "What should be retained"]];

function Results({ caseId }: { caseId: string }) {
  const { run, busy } = useStage();
  const [f, setF] = useState<Record<string, string>>({});
  const [oc, setOc] = useState<Record<string, string>>({});
  const [forecastId, setForecastId] = useState("");
  const forecasts = useQuery({ queryKey: ["forecasts", caseId], queryFn: async () => (await supabase.from("forecasts").select("*").eq("case_id", caseId).order("created_at")).data ?? [] });
  const outcomes = useQuery({ queryKey: ["outcomes", caseId], queryFn: async () => (await supabase.from("outcome_records").select("*").eq("case_id", caseId).order("created_at")).data ?? [] });

  async function addForecast() {
    if (!f["expected_result"]) { toast.error("Expected result is required."); return; }
    const owner = await uid();
    const { error } = await supabase.from("forecasts").insert({ owner_id: owner, case_id: caseId, expected_result: f["expected_result"], ...Object.fromEntries(F_FIELDS.slice(1).map(([k]) => [k, f[k] || null])) });
    if (error) { toast.error(error.message); return; }
    setF({}); forecasts.refetch(); toast.success("Forecast registered. It cannot be overwritten.");
  }
  async function addOutcome() {
    if (!oc["actual_result"]) { toast.error("Actual result is required."); return; }
    const owner = await uid();
    const useful = Number(oc["usefulness"]);
    const { data, error } = await supabase.from("outcome_records").insert({ owner_id: owner, case_id: caseId, forecast_id: forecastId || null, actual_result: oc["actual_result"], usefulness: useful >= 1 && useful <= 5 ? useful : null, ...Object.fromEntries(O_FIELDS.slice(1).map(([k]) => [k, oc[k] || null])) }).select("*").single();
    if (error) { toast.error(error.message); return; }
    const fc = forecasts.data?.find((x) => x.id === forecastId);
    const r = await run({ stage: "OUTCOME_REVIEW", caseId, text: JSON.stringify({ forecast: fc ?? null, outcome: data }) });
    if (r) await supabase.from("learning_events").insert({ owner_id: owner, case_id: caseId, event_type: "OUTCOME_LEARNING", context: "Outcome recorded", previous_proposition: fc?.expected_result ?? null, revised_proposition: String(r.output["learning_summary"] ?? ""), reason: ((r.output["method_implications"] as string[]) ?? []).join("; "), scope: "CASE" });
    setOc({}); outcomes.refetch(); toast.success("Outcome recorded and learning event created.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="seer-panel space-y-2 p-4">
          <div className="seer-label">Register forecast (before outcome)</div>
          {F_FIELDS.map(([k, l]) => <div key={k} className="space-y-1"><Label htmlFor={`f-${k}`}>{l}</Label><Input id={`f-${k}`} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
          <Button size="sm" onClick={addForecast}>Register forecast</Button>
        </div>
        {forecasts.data?.map((x) => (
          <div key={x.id} className="seer-panel p-3 text-sm"><div className="seer-label">Forecast · {new Date(x.created_at).toLocaleDateString("en-GB")} · immutable</div><p>{x.expected_result}</p><p className="text-xs text-muted-foreground">{[x.metric, x.unit, x.baseline && `baseline ${x.baseline}`, x.horizon].filter(Boolean).join(" · ")}</p></div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="seer-panel space-y-2 p-4">
          <div className="seer-label">Record outcome</div>
          <div className="space-y-1"><Label htmlFor="fc">Against forecast</Label><select id="fc" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={forecastId} onChange={(e) => setForecastId(e.target.value)}><option value="">None</option>{forecasts.data?.map((x) => <option key={x.id} value={x.id}>{x.expected_result.slice(0, 60)}</option>)}</select></div>
          {O_FIELDS.map(([k, l]) => <div key={k} className="space-y-1"><Label htmlFor={`o-${k}`}>{l}</Label>{["actual_result", "evidence"].includes(k) ? <Textarea id={`o-${k}`} rows={2} value={oc[k] ?? ""} onChange={(e) => setOc({ ...oc, [k]: e.target.value })} /> : <Input id={`o-${k}`} value={oc[k] ?? ""} onChange={(e) => setOc({ ...oc, [k]: e.target.value })} />}</div>)}
          <div className="space-y-1"><Label htmlFor="o-u">Usefulness 1-5</Label><Input id="o-u" type="number" min={1} max={5} value={oc["usefulness"] ?? ""} onChange={(e) => setOc({ ...oc, usefulness: e.target.value })} /></div>
          <Button size="sm" disabled={!!busy} onClick={addOutcome}>{busy ? "Reviewing…" : "Record outcome"}</Button>
          <p className="text-xs text-muted-foreground">One outcome does not become a universal rule.</p>
        </div>
        {outcomes.data?.map((x) => (
          <div key={x.id} className="seer-panel p-3 text-sm"><div className="seer-label">Outcome · {new Date(x.created_at).toLocaleDateString("en-GB")} · usefulness {x.usefulness ?? "—"}</div><p>{x.actual_result}</p>{x.retain && <Block label="Retain"><p>{x.retain}</p></Block>}</div>
        ))}
        {!outcomes.data?.length && <Bullets items={[]} empty="No outcomes recorded yet." />}
      </div>
    </div>
  );
}
