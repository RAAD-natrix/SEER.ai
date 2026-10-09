import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Block, Bullets, StatusTag } from "@/components/seer/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { audit, uid, useStage } from "@/lib/seer/client";
import { ResearchStage } from "@/components/seer/ResearchStage";
import { SandboxStage } from "@/components/seer/SandboxStage";
import { OutcomesStage } from "@/components/seer/OutcomesStage";
import { OverviewStage } from "@/components/seer/OverviewStage";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";

export const Route = createFileRoute("/_authenticated/work/$caseId")({
  head: () => ({ meta: [{ title: "Case — SEER.ai" }, { name: "description", content: "Review the brief, research, strategic alternatives and outcomes for a SEER.ai case." }, { property: "og:title", content: "Case — SEER.ai" }, { property: "og:description", content: "Review the brief, research, strategic alternatives and outcomes for a SEER.ai case." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CasePage,
});

const STEPS = ["OVERVIEW", "BRIEF", "RESEARCH", "SANDBOX", "OUTCOMES"] as const;
const FIELDS: [string, string][] = [
  ["primary_audience", "Primary audience"],
  ["decision", "Decision / question"],
  ["decision_owner", "Decision owner"],
  ["deadline", "Deadline"],
  ["scope", "Scope"],
  ["constraints", "Known constraints"],
  ["exclusions", "Known exclusions"],
  ["known_evidence", "Known evidence"],
  ["deliverable", "Requested deliverable if known"],
  ["strategic_context", "Supporting strategic context"],
];

function CasePage() {
  const { caseId } = Route.useParams();
  const [step, setStep] = useState<(typeof STEPS)[number]>("OVERVIEW");
  const kase = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => (await supabase.from("cases").select("*").eq("id", caseId).single()).data,
  });
  const c = kase.data;
  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="seer-label">{c?.client || "Case"} · {c?.engagement_mode}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusTag s={c?.status ?? "ACTIVE"} /> Last saved {c ? new Date(c.updated_at).toLocaleString("en-GB") : "—"}
        </div>
      </div>
      <WorkbenchIdentity area="WORK" title={c?.title ?? "Case"} />
      <nav aria-label="Workflow" className="mb-6 grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => { setStep(s); if (c && s !== "OVERVIEW" && c.stage !== s) supabase.from("cases").update({ stage: s }).eq("id", caseId).then(() => kase.refetch()); }} className={`rounded border px-2 py-2 font-mono text-xs tracking-wider ${step === s ? "border-primary text-primary" : "text-muted-foreground"}`}>
            {i === 0 ? "◆" : i} {s}
          </button>
        ))}
      </nav>
      {step === "OVERVIEW" ? (
        <OverviewStage caseId={caseId} onGo={setStep} />
      ) : step === "BRIEF" ? (
        <BriefStage caseId={caseId} onSaved={() => kase.refetch()} />
      ) : step === "RESEARCH" ? (
        <ResearchStage caseId={caseId} activePathId={c?.active_path_id ?? null} />
      ) : step === "SANDBOX" ? (
        <SandboxStage caseId={caseId} activePathId={c?.active_path_id ?? null} onActive={async (id) => { await supabase.from("cases").update({ active_path_id: id }).eq("id", caseId); kase.refetch(); }} />
      ) : (
        <OutcomesStage caseId={caseId} />
      )}
    </AppShell>
  );
}

function BriefStage({ caseId, onSaved }: { caseId: string; onSaved: () => void }) {
  const { run, busy } = useStage();
  const versions = useQuery({
    queryKey: ["briefs", caseId],
    queryFn: async () => (await supabase.from("brief_versions").select("*").eq("case_id", caseId).order("version", { ascending: false })).data ?? [],
  });
  const [viewV, setViewV] = useState<number | null>(null);
  const latest = versions.data?.[0];
  const shown = versions.data?.find((v) => v.version === viewV) ?? latest;
  const [raw, setRaw] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (latest) {
      setRaw(latest.raw_brief);
      setFields((latest.fields as Record<string, string>) ?? {});
      setAnswers((latest.answers as Record<string, string>) ?? {});
    }
  }, [latest?.id]);

  async function saveVersion(): Promise<string | null> {
    if (!raw.trim()) { toast.error("Tell SEER about the job first."); return null; }
    const owner = await uid();
    const next = (latest?.version ?? 0) + 1;
    // Never overwrite: every save is a new immutable version.
    const { data, error } = await supabase.from("brief_versions").insert({ owner_id: owner, case_id: caseId, version: next, raw_brief: raw, fields: fields as never, answers: answers as never }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    await supabase.from("cases").update({ fields: fields as never }).eq("id", caseId);
    await audit("BRIEF_VERSION_SAVED", "brief_version", data.id, { version: next });
    await versions.refetch();
    setViewV(null);
    onSaved();
    return data.id;
  }

  async function triage() {
    const id = await saveVersion();
    if (!id) return;
    const r = await run({ stage: "BRIEF_TRIAGE", caseId });
    if (!r) return;
    await supabase.from("brief_versions").update({ triage: { ...r.output, _run_id: r.runId, _model: r.model } as never }).eq("id", id);
    toast.success("Initial analysis complete.");
    versions.refetch();
  }

  async function saveAnswers() {
    if (!shown) return;
    await supabase.from("brief_versions").update({ answers: answers as never }).eq("id", shown.id);
    toast.success("Answers saved to this brief version.");
    versions.refetch();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = shown?.triage as any;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="seer-panel space-y-3 p-4">
          <Label htmlFor="raw" className="text-base">Tell SEER everything you know about the job.</Label>
          <Textarea id="raw" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste the brief, background, and anything you have been told." />
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, l]) => (
              <div key={k} className={`space-y-1 ${k === "strategic_context" || k === "known_evidence" ? "sm:col-span-2" : ""}`}>
                <Label htmlFor={k}>{l}</Label>
                {k === "strategic_context" || k === "known_evidence" ? (
                  <Textarea id={k} rows={3} value={fields[k] ?? ""} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
                ) : (
                  <Input id={k} value={fields[k] ?? ""} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={triage} disabled={!!busy}>{busy ? "Analysing…" : "Save & run initial analysis"}</Button>
            <Button variant="outline" onClick={saveVersion} disabled={!!busy}>Save new version only</Button>
          </div>
          <p className="text-xs text-muted-foreground">Each save creates a new brief version. The original is never overwritten. Initial analysis clarifies the brief and does not solve the strategy.</p>
        </div>
        {!!versions.data?.length && (
          <div className="seer-panel p-3">
            <div className="seer-label mb-2">Brief versions</div>
            <div className="flex flex-wrap gap-1">
              {versions.data.map((v) => (
                <button key={v.id} onClick={() => setViewV(v.version)} className={`rounded border px-2 py-1 font-mono text-xs ${shown?.id === v.id ? "border-primary text-primary" : "text-muted-foreground"}`}>
                  v{v.version}{v.triage ? " ✓" : ""}
                </button>
              ))}
            </div>
            {shown && shown.id !== latest?.id && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{shown.raw_brief}</p>}
          </div>
        )}
      </div>

      <div>
        {!t ? (
          <p className="text-sm text-muted-foreground">{busy ? "SEER is reading the brief…" : "No initial analysis for this version yet."}</p>
        ) : (
          <div className="seer-panel space-y-4 p-4">
            <div className="flex items-center justify-between"><div className="seer-label">Brief triage · v{shown?.version}</div><span className="font-mono text-xs text-muted-foreground">{t._model}</span></div>
            <Block label="Brief as written"><p className="text-sm">{t.brief_as_written}</p></Block>
            <Block label="Apparent decision"><p className="text-sm">{t.apparent_decision}</p></Block>
            <Block label="Mandatory requirements"><Bullets items={t.mandatory_requirements} /></Block>
            <Block label="What is known"><Bullets items={t.what_is_known} /></Block>
            <Block label="Asserted but not established"><Bullets items={t.asserted_not_established} /></Block>
            <Block label="Missing information"><Bullets items={t.missing_information} /></Block>
            <Block label="Contradictions or ambiguities"><Bullets items={t.contradictions_or_ambiguities} /></Block>
            <Block label="What should not be assumed"><Bullets items={t.should_not_be_assumed} /></Block>
            <Block label="Likely strategic depth"><p className="text-sm">{t.likely_strategic_depth}</p></Block>
            <Block label="Provisional output types"><Bullets items={t.provisional_output_types} /></Block>
            <Questions title="Critical questions SEER needs answered" qs={t.critical_questions} answers={answers} setAnswers={setAnswers} prefix="c" />
            <Questions title="Useful but not essential (may be ignored)" qs={t.useful_questions} answers={answers} setAnswers={setAnswers} prefix="u" />
            <Button size="sm" variant="outline" onClick={saveAnswers}>Save answers</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Questions({ title, qs, answers, setAnswers, prefix }: { title: string; qs: unknown; answers: Record<string, string>; setAnswers: (a: Record<string, string>) => void; prefix: string }) {
  const list = Array.isArray(qs) ? qs.map(String) : [];
  return (
    <Block label={title}>
      {list.length ? list.map((q, i) => (
        <div key={i} className="space-y-1">
          <p className="text-sm">{q}</p>
          <Input aria-label={q} value={answers[`${prefix}${i}`] ?? ""} onChange={(e) => setAnswers({ ...answers, [`${prefix}${i}`]: e.target.value })} placeholder="Answer (optional)" />
        </div>
      )) : <p className="text-sm text-muted-foreground">—</p>}
    </Block>
  );
}
