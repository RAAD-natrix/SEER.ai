import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Block, Bullets, StatusTag } from "@/components/seer/AppShell";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";
import { MethodCard, fullScan } from "@/components/seer/MethodCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCEPT } from "@/lib/seer/extract";
import { deleteSource, uploadSource } from "@/lib/seer/sources";
import { audit, uid, useStage } from "@/lib/seer/client";

export const Route = createFileRoute("/_authenticated/think")({
  head: () => ({ meta: [{ title: "Think — SEER.ai" }, { name: "description", content: "Teach SEER how you think from past work." }, { property: "og:title", content: "Think — SEER.ai" }, { property: "og:description", content: "Teach SEER how you think from past work." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Think,
});

const CLASSES = [
  "PAST WORK — METHOD ONLY",
  "PAST WORK — STYLE ONLY",
  "PAST WORK — TEMPLATE STRUCTURE ONLY",
  "PAST WORK — CASE REFERENCE ONLY",
  "PERSONAL WRITING / THINKING",
  "OTHER",
];

function Think() {
  const [file, setFile] = useState<File | null>(null);
  const [cls, setCls] = useState(CLASSES[0]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { run, busy } = useStage();

  const sources = useQuery({
    queryKey: ["think-sources"],
    queryFn: async () => (await supabase.from("sources").select("id,title,filename,classification,status,coverage,warnings,review,created_at,size_bytes").eq("area", "think").is("deleted_at", null).order("created_at", { ascending: false })).data ?? [],
  });
  const methods = useQuery({
    queryKey: ["think-methods", selected],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("method_rules").select("*").contains("source_ids", [selected!]).order("created_at")).data ?? [],
  });
  const sel = sources.data?.find((s) => s.id === selected);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const review = sel?.review as any;

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const { source, duplicates } = await uploadSource(file, { area: "think", classification: cls ?? "OTHER", title: title || file.name });
      if (duplicates.length) toast.warning(`Identical file already uploaded: ${duplicates.map((d) => d.title).join(", ")}`);
      toast.success(`Uploaded — ${source.status}`);
      setFile(null); setTitle("");
      await sources.refetch();
      setSelected(source.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function study() {
    if (!sel) return;
    if (sel.status === "EXTRACTION_FAILED" || sel.status === "NEEDS_VISUAL_REVIEW") { toast.error("No extracted text to study. This source needs visual review."); return; }
    const r = await run({ stage: "THINK_STUDY", sourceId: sel.id, extra: { classification: sel.classification } });
    if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = r.output as any;
    await supabase.from("sources").update({ review: out as never, status: sel.status === "EXTRACTED" ? "STUDIED" : "STUDIED_PARTIAL" }).eq("id", sel.id);
    const owner = await uid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards: any[] = out.candidate_methods ?? [];
    const mem = sel.classification?.includes("STYLE") ? "STYLE" : sel.classification?.includes("TEMPLATE") ? "TEMPLATE" : sel.classification?.includes("CASE REFERENCE") ? "CASE_REFERENCE" : "METHOD";
    for (const c of cards) {
      const rule = { ...c, source_ids: [sel.id] };
      const scan = await fullScan(rule as never, run);
      const caseOnly = mem === "CASE_REFERENCE";
      const { data: ins } = await supabase.from("method_rules").insert({
        owner_id: owner, name: c.name, memory_class: mem, problem_type: c.problem_type, mechanism: c.mechanism, why_useful: c.why_useful,
        prerequisites: c.prerequisites, use_when: c.use_when, do_not_use_when: c.do_not_use_when, counterexamples: c.counterexamples,
        required_evidence: c.required_evidence, falsifier: c.falsifier, source_ids: [sel.id], contamination: scan as never,
        status: caseOnly ? "CASE_ONLY" : scan.blocked ? "BLOCKED_FOR_GENERAL_REUSE" : "PENDING_REVIEW",
        confidentiality_scope: caseOnly ? "SOURCE_ONLY" : "GENERAL",
      }).select("id").single();
      await supabase.from("learning_events").insert({ owner_id: owner, source_id: sel.id, event_type: "METHOD_CANDIDATE", context: "THINK study", revised_proposition: c.mechanism, method_rule_id: ins?.id ?? null, scope: "CANDIDATE" });
    }
    toast.success(`Study complete. ${cards.length} candidate method(s) for review.`);
    sources.refetch(); methods.refetch();
  }

  return (
    <AppShell>
      <WorkbenchIdentity area="THINK" title="Teach SEER how I think" />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="seer-panel space-y-3 p-4">
            <div className="seer-label">Add past work</div>
            <div className="space-y-1"><Label htmlFor="tf">File (PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, JSON, images)</Label><Input id="tf" type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="space-y-1"><Label htmlFor="tt">Title</Label><Input id="tt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" /></div>
            <div className="space-y-1">
              <Label htmlFor="tc">Classification</Label>
              <select id="tc" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}>
                {CLASSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <Button onClick={upload} disabled={!file || uploading} className="w-full">{uploading ? "Uploading & extracting…" : "Upload"}</Button>
          </div>
          <div className="seer-panel divide-y">
            {sources.data?.length ? sources.data.map((s) => (
              <button key={s.id} onClick={() => setSelected(s.id)} className={`block w-full px-3 py-2.5 text-left hover:bg-secondary ${selected === s.id ? "bg-secondary" : ""}`}>
                <div className="truncate text-sm">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusTag s={s.status} /><span className="seer-label">{(s.coverage as { coverage_percent?: number })?.coverage_percent ?? 0}% coverage</span></div>
              </button>
            )) : <p className="p-3 text-sm text-muted-foreground">No sources yet.</p>}
          </div>
        </div>

        <div>
          {!sel ? (
            <p className="text-sm text-muted-foreground">Select a source to review it, study it and approve candidate methods.</p>
          ) : (
            <div className="space-y-4">
              <div className="seer-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium">{sel.title}</h2>
                    <div className="seer-label mt-1">{sel.classification}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={study} disabled={!!busy}>{busy ? `Running ${busy}…` : review ? "Re-study" : "Study source"}</Button>
                    <Button variant="ghost" onClick={async () => { if (!confirm("Delete source and retire methods derived from it?")) return; await deleteSource(sel.id); setSelected(null); sources.refetch(); }}>Delete</Button>
                  </div>
                </div>
                <CoverageLine c={sel.coverage} />
                {sel.warnings?.length > 0 && <details className="mt-2 text-xs text-muted-foreground"><summary>Extraction warnings ({sel.warnings.length})</summary><ul className="list-disc pl-5">{sel.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
                {sel.status !== "EXTRACTED" && sel.status !== "STUDIED" && <p className="mt-2 text-xs text-warning">This source is not fully extracted. SEER will not report it as fully studied.</p>}
              </div>

              {review && (
                <div className="seer-panel grid gap-4 p-4 md:grid-cols-2">
                  <Block label="What the source appears to be doing"><p className="text-sm">{String(review.what_source_is_doing ?? "")}</p></Block>
                  <Block label="Reasoning moves detected"><Bullets items={review.reasoning_moves} /></Block>
                  {[
                    ["argument_evolution", "How the argument evolves"], ["evidence_use", "How evidence is used"], ["contradiction_handling", "How contradictions are handled"],
                    ["alternative_creation", "How alternatives are created"], ["operational_consequences", "Idea into operational consequences"], ["abstract_to_mechanism", "Abstract idea to practical mechanism"],
                    ["commercial_reality_testing", "How commercial reality is tested"], ["implementation_link", "Implementation connected to strategy"], ["simplification_for_audience", "Complexity simplified for audience"],
                  ].map(([k, l]) => k && l && <Block key={k} label={l}><p className="text-sm">{String(review[k] ?? "—")}</p></Block>)}
                  <Block label="Case-specific content that must not transfer"><Bullets items={review.case_specific_do_not_transfer} /></Block>
                  <Block label="What this source does not prove about the owner's general method"><Bullets items={review.what_this_does_not_prove} /></Block>
                </div>
              )}

              {methods.data && methods.data.length > 0 && (
                <div className="space-y-3">
                  <div className="seer-label">Possible reusable methods — candidates require your review</div>
                  {methods.data.map((m) => <MethodCard key={m.id + m.version + m.status} rule={m} onChange={() => { methods.refetch(); audit("METHOD_EDITED", "method_rule", m.id); }} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export function CoverageLine({ c }: { c: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (c ?? {}) as any;
  return (
    <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
      <span>TOTAL_UNITS {v.total_units ?? 0} {v.unit}</span>
      <span>EXTRACTED {v.extracted_units ?? 0}</span>
      <span>VISUAL_REVIEW {v.visual_review_required ?? 0}</span>
      <span>FAILED {v.failed_units ?? 0}</span>
      <span className="text-foreground">COVERAGE {v.coverage_percent ?? 0}%</span>
    </div>
  );
}
