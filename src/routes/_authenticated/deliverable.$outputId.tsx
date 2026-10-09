import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle, StatusTag } from "@/components/seer/AppShell";
import { RedTeamView } from "@/components/seer/SandboxStage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { loadCaseBundle, readinessFor } from "@/lib/seer/caseData";
import { deliverableMarkdown, exportDocx, exportPdf } from "@/lib/seer/export";
import { audit, useStage } from "@/lib/seer/client";
import type { Tables } from "@/integrations/supabase/types";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";

export const Route = createFileRoute("/_authenticated/deliverable/$outputId")({
  head: () => ({ meta: [{ title: "Final deliverable — SEER.ai" }, { name: "description", content: "Edit, review and approve a deliverable as FINAL." }, { property: "og:title", content: "Final deliverable — SEER.ai" }, { property: "og:description", content: "Edit, review and approve a deliverable as FINAL." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DeliverablePage,
});

const FINAL = "FINAL — OWNER APPROVED";

function DeliverablePage() {
  const { outputId } = Route.useParams();
  const { run, busy } = useStage();
  const q = useQuery({ queryKey: ["deliverable", outputId], queryFn: async () => (await supabase.from("outputs").select("*").eq("id", outputId).single()).data });
  const versions = useQuery({ queryKey: ["ov", outputId], queryFn: async () => (await supabase.from("output_versions").select("*").eq("output_id", outputId).order("version", { ascending: false })).data ?? [] });
  const o = q.data;
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (o) setText(o.content); }, [o?.id, o?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!o && text !== o.content;

  async function recompute(out: Tables<"outputs">, patch: Partial<Tables<"outputs">> = {}) {
    const fresh = await loadCaseBundle(out.case_id);
    const m = { ...out, ...patch };
    const rd = readinessFor(fresh, m.template_key, m.redteam as { fatal?: string[] } | null, !!m.approved_at);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qa = m.qa as any; const rt = m.redteam as any;
    const qaFails = qa?.checks?.some((c: { pass: boolean }) => !c.pass) || qa?.duplication_found;
    let status = "NOT READY";
    if (m.redteam && m.qa) status = rd.blockers.length || qaFails || rt?.fatal?.length ? "READY SUBJECT TO CORRECTIONS" : "READY FOR OWNER APPROVAL";
    if (m.approved_at && rd.canBeFinal && !qaFails && !rt?.fatal?.length) status = FINAL;
    const { data: saved, error } = await supabase.from("outputs").update({ ...patch, readiness: rd as never, status }).eq("id", out.id).eq("version", out.version).eq("content", out.content).select("id").maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (!saved) { toast.error("Deliverable changed. Reload and run reviews on the latest version."); await q.refetch(); return null; }
    await q.refetch(); versions.refetch();
    return status;
  }

  async function save() {
    if (!o) return;
    if (!reason.trim()) { toast.error("Give a short reason for this edit."); return; }
    const { data: v, error } = await supabase.rpc("save_output_version", { _output_id: o.id, _expected_version: o.version, _content: text, _reason: reason });
    if (error) { toast.error(error.message); return; }
    await q.refetch(); await versions.refetch();
    setReason("");
    toast.success(`Saved as v${v}. Run Red Team and QA again before approving.`);
  }

  if (!o) return <AppShell><p className="text-sm text-muted-foreground">{q.isLoading ? "Loading…" : "Deliverable not found."}</p></AppShell>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rd = o.readiness as any; const qa = o.qa as any;
  const isFinal = o.status === FINAL;
  const materialOpen = !isFinal && ((o.redteam as { material?: string[] } | null)?.material?.length ?? 0) > 0;

  return (
    <AppShell>
      <Link to="/work/$caseId" params={{ caseId: o.case_id }} className="seer-label hover:text-primary">← Back to case</Link>
      <WorkbenchIdentity area="FINAL DELIVERABLE" title={o.title} />
      <div className="seer-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <StatusTag s={o.status} /><span className="seer-label">v{o.version}{rd ? ` · readiness ${rd.index}` : ""}</span>
        <span className="mr-auto" />
        <Button size="sm" variant="outline" disabled={!!busy || dirty} onClick={async () => { const r = await run({ stage: "OUTPUT_REDTEAM", caseId: o.case_id, outputId: o.id }); if (r) await recompute(o, { redteam: r.output as never }); }}>{busy === "OUTPUT_REDTEAM" ? "Running…" : "Run Red Team"}</Button>
        <Button size="sm" variant="outline" disabled={!!busy || dirty} onClick={async () => { const r = await run({ stage: "OUTPUT_QA", caseId: o.case_id, outputId: o.id }); if (r) await recompute(o, { qa: r.output as never }); }}>{busy === "OUTPUT_QA" ? "Running…" : "Run QA"}</Button>
        <Button size="sm" disabled={dirty || materialOpen || o.status !== "READY FOR OWNER APPROVAL"} onClick={async () => { const s = await recompute(o, { approved_at: new Date().toISOString() }); if (s === FINAL) { await audit("OUTPUT_FINAL_APPROVAL", "output", o.id); toast.success("Approved as FINAL."); } }}>Approve as FINAL</Button>
        <Button size="sm" variant="ghost" disabled={dirty} onClick={async () => { try { await exportDocx(o.title, deliverableMarkdown(o)); await audit("EXPORT", "output", o.id, { format: "docx" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } }}>Download Word</Button>
        <Button size="sm" variant="ghost" disabled={dirty} onClick={async () => { try { await exportPdf(o.title, deliverableMarkdown(o)); await audit("EXPORT", "output", o.id, { format: "pdf" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Download failed"); } }}>PDF</Button>
      </div>
      {materialOpen && <p role="alert" className="mb-3 text-sm text-warning">Unresolved material Red Team findings. Revise the record and run Red Team and QA again before approval.</p>}
      {rd?.blockers?.length > 0 && <div className="seer-panel mb-4 p-3 text-xs"><div className="seer-label text-destructive">Blockers</div><ul className="list-disc pl-5">{rd.blockers.map((b: { label: string }) => <li key={b.label}>{b.label}</li>)}</ul></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="seer-label">Edit</div>
          <Textarea aria-label="Deliverable text" rows={30} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
          <div className="flex gap-2"><Input placeholder="Reason for edit" value={reason} onChange={(e) => setReason(e.target.value)} /><Button disabled={!dirty} onClick={save}>Save version</Button>{dirty && <Button variant="ghost" onClick={() => setText(o.content)}>Discard</Button>}</div>
        </div>
        <div className="space-y-2"><div className="seer-label">Preview</div><div className="seer-panel seer-prose max-h-[75vh] overflow-y-auto p-5 text-sm"><ReactMarkdown>{dirty ? text : deliverableMarkdown(o)}</ReactMarkdown></div></div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {o.redteam && <div className="seer-panel space-y-2 p-4"><div className="seer-label">Red Team</div><RedTeamView r={o.redteam} /></div>}
        {qa && <div className="seer-panel p-4"><div className="seer-label mb-1">Quality gate</div>{(qa.checks ?? []).map((c: { test: string; pass: boolean; note: string }, i: number) => <div key={i} className="text-sm"><span className={c.pass ? "text-primary" : "text-destructive"}>{c.pass ? "PASS" : "FAIL"}</span> {c.test} <span className="text-muted-foreground">— {c.note}</span></div>)}</div>}
      </div>
      <div className="seer-panel mt-4 p-3"><div className="seer-label mb-1">Versions</div>{versions.data?.map((v) => <div key={v.id} className="text-xs text-muted-foreground">v{v.version} · {v.status} · {new Date(v.created_at).toLocaleString("en-GB")}</div>)}</div>
    </AppShell>
  );
}
