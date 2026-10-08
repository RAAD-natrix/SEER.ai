import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { StatusTag } from "./AppShell";
import { scanContamination, type ContaminationResult } from "@/lib/seer/contamination";
import { audit, useStage } from "@/lib/seer/client";
import type { Tables } from "@/integrations/supabase/types";

type Rule = Tables<"method_rules">;
const FIELDS: [keyof Rule, string][] = [
  ["problem_type", "Problem type"],
  ["mechanism", "Reasoning mechanism"],
  ["why_useful", "Why it was useful"],
  ["prerequisites", "Prerequisites"],
  ["use_when", "Use when"],
  ["do_not_use_when", "Do not use when"],
  ["counterexamples", "Counterexamples"],
  ["required_evidence", "Evidence future use requires"],
  ["falsifier", "What would falsify it"],
];

export async function fullScan(rule: Partial<Rule>, run: ReturnType<typeof useStage>["run"]) {
  let srcText = "";
  let entities: string[] = [];
  if (rule.source_ids?.length) {
    const { data } = await supabase.from("sources").select("extracted_text,review").in("id", rule.source_ids);
    srcText = (data ?? []).map((d) => d.extracted_text ?? "").join("\n");
    entities = (data ?? []).flatMap((d) => ((d.review as Record<string, unknown> | null)?.source_entities as string[] | undefined) ?? []);
  }
  const det = scanContamination(rule as Record<string, unknown>, srcText, entities);
  const ai = await run({ stage: "CONTAMINATION_SCAN", text: JSON.stringify(Object.fromEntries(FIELDS.map(([k]) => [k, rule[k]]).concat([["name", rule.name]]))) });
  const aiIssues = ai?.ok && (ai.output as { leak_found: boolean }).leak_found ? ((ai.output as { issues: string[] }).issues ?? []) : [];
  const result: ContaminationResult & { ai_issues: string[]; ai_checked: boolean } = { ...det, blocked: det.blocked || aiIssues.length > 0, ai_issues: aiIssues, ai_checked: !!ai?.ok };
  return result;
}

export function MethodCard({ rule, onChange }: { rule: Rule; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Rule>(rule);
  const { run, busy } = useStage();
  const c = rule.contamination as (ContaminationResult & { ai_issues?: string[] }) | null;

  async function save(rescan = true) {
    const patch: Partial<Rule> = { name: draft.name, ...Object.fromEntries(FIELDS.map(([k]) => [k, draft[k]])) };
    if (rescan && rule.status !== "STARTER") {
      const scan = await fullScan({ ...rule, ...patch }, run);
      patch.contamination = scan as never;
      patch.status = scan.blocked ? "BLOCKED_FOR_GENERAL_REUSE" : rule.status === "BLOCKED_FOR_GENERAL_REUSE" ? "PENDING_REVIEW" : rule.status;
    }
    patch.version = rule.version + 1;
    const { error } = await supabase.from("method_rules").update(patch).eq("id", rule.id);
    if (error) return toast.error(error.message);
    setEdit(false);
    onChange();
  }
  async function setStatus(status: string, event: string) {
    if ((status === "CANDIDATE" || status === "CANONICAL") && rule.status === "BLOCKED_FOR_GENERAL_REUSE") return toast.error("Blocked cards cannot be promoted. Edit and rescan first.");
    const { error } = await supabase.from("method_rules").update({ status }).eq("id", rule.id);
    if (error) return toast.error(error.message);
    await audit(event, "method_rule", rule.id, { from: rule.status, to: status });
    if (status === "CANONICAL") await supabase.from("learning_events").insert({ owner_id: rule.owner_id, event_type: "CANONICAL_PRINCIPLE", revised_proposition: rule.mechanism, method_rule_id: rule.id, confirmed: true, scope: "GENERAL" });
    onChange();
  }

  return (
    <div className="seer-panel p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {edit ? <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="max-w-md" /> : <h3 className="font-medium">{rule.name}</h3>}
        <StatusTag s={rule.status} />
        <span className="seer-label">{rule.memory_class} · v{rule.version}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <div key={k}>
            <div className="seer-label">{label}</div>
            {edit ? (
              <Textarea rows={2} value={(draft[k] as string) ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            ) : (
              <p className="text-sm">{(rule[k] as string) || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
        ))}
      </div>
      {c && c.issues?.length + (c.ai_issues?.length ?? 0) > 0 && (
        <div className="mt-3 rounded border border-destructive p-2 text-sm">
          <div className="seer-label text-destructive">Contamination scan — likely leakage</div>
          <ul className="list-disc pl-5">
            {c.issues.map((i, n) => <li key={n}><span className="font-mono text-xs">{i.type}</span>: {i.match}</li>)}
            {c.ai_issues?.map((i, n) => <li key={`a${n}`}><span className="font-mono text-xs">ai</span>: {i}</li>)}
          </ul>
        </div>
      )}
      {c && !c.blocked && <p className="mt-2 text-xs text-muted-foreground">Contamination scan passed ({c.method}{(c as { ai_checked?: boolean }).ai_checked ? " + AI review" : ", AI review unavailable"}).</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {edit ? (
          <>
            <Button size="sm" onClick={() => save(true)} disabled={!!busy}>{busy ? "Scanning…" : "Save & rescan"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(rule); setEdit(false); }}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>Edit</Button>
        )}
        {rule.status === "PENDING_REVIEW" && <Button size="sm" onClick={() => setStatus("CANDIDATE", "METHOD_APPROVED_CANDIDATE")}>Approve as reusable candidate</Button>}
        {["STARTER", "CANDIDATE"].includes(rule.status) && <Button size="sm" onClick={() => setStatus("CANONICAL", "METHOD_PROMOTED_CANONICAL")}>Confirm canonical</Button>}
        {rule.status !== "RETIRED" && <Button size="sm" variant="ghost" onClick={() => setStatus("RETIRED", "METHOD_RETIRED")}>Retire</Button>}
        {rule.status === "RETIRED" && <Button size="sm" variant="ghost" onClick={() => setStatus(c?.blocked ? "BLOCKED_FOR_GENERAL_REUSE" : "PENDING_REVIEW", "METHOD_RESTORED")}>Restore for review</Button>}
      </div>
    </div>
  );
}
