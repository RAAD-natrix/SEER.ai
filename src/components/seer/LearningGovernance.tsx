import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStage } from "@/lib/seer/client";
import type { Tables } from "@/integrations/supabase/types";

type Rule = Tables<"method_rules">;
type Review = Tables<"learning_reviews">;

export const TRANSFER_FIELDS: [keyof Rule, string][] = [
  ["name", "Title"], ["problem_type", "Problem"], ["mechanism", "Mechanism"],
  ["use_when", "Applies when"], ["do_not_use_when", "Avoid when"], ["required_evidence", "Required evidence"],
];

/** Mirrors the database transfer screen so the owner sees failures before submitting. */
export function transferScreen(rule: Rule) {
  const text = TRANSFER_FIELDS.map(([k]) => String(rule[k] ?? "")).join(" ");
  const issues: string[] = [];
  if (/[0-9]/.test(text)) issues.push("Contains digits");
  if (/(https?:\/\/|www\.|@)/i.test(text)) issues.push("Contains a link or address");
  if (!rule.mechanism?.trim()) issues.push("Mechanism is empty");
  return issues;
}

export function governanceState(rule: Rule, reviews: Review[]) {
  const lastContra = reviews.filter((r) => r.kind === "CONTRADICTION").map((r) => r.created_at).sort().at(-1) ?? "";
  const current = reviews.filter((r) => r.rule_version === rule.version && r.created_at > lastContra);
  const latest = (kind: string) => current.filter((r) => r.kind === kind).sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  const challenged = current.some((r) => r.kind === "CHALLENGE");
  const validated = latest("VALIDATION")?.outcome === "PASS";
  const transferPassed = latest("TRANSFER_REVIEW")?.outcome === "PASS";
  return { challenged, validated, transferPassed, blocked: rule.blocking_challenge, canActivate: challenged && validated && !rule.blocking_challenge };
}

export function LearningGovernance({ rule, onChange }: { rule: Rule; onChange: () => void }) {
  const reviews = useQuery({ queryKey: ["learning_reviews", rule.id], queryFn: async () => (await supabase.from("learning_reviews").select("*").eq("method_rule_id", rule.id).order("created_at")).data ?? [] });
  const [notes, setNotes] = useState("");
  const [bounds, setBounds] = useState("");
  const { run, busy } = useStage();
  const list = reviews.data ?? [];
  const g = governanceState(rule, list);
  const screen = transferScreen(rule);

  async function record(kind: Review["kind"], outcome: Review["outcome"], extra: Partial<Review> = {}) {
    const text = extra.notes ?? notes;
    if (!text.trim()) { toast.error("Write the review note first."); return false; }
    const { error } = await supabase.from("learning_reviews").insert({ owner_id: rule.owner_id, method_rule_id: rule.id, kind, outcome, notes: text, boundaries: extra.boundaries ?? (bounds || null), ai_run_id: extra.ai_run_id ?? null, case_id: rule.case_id });
    if (error) { toast.error(error.message); return false; }
    setNotes(""); setBounds(""); await reviews.refetch(); onChange(); return true;
  }
  async function aiChallenge() {
    const r = await run({ stage: "METHOD_CHALLENGE", text: JSON.stringify(Object.fromEntries(["name", "problem_type", "mechanism", "why_useful", "prerequisites", "use_when", "do_not_use_when", "counterexamples", "required_evidence", "falsifier"].map((k) => [k, rule[k as keyof Rule]]))) });
    if (!r) return;
    const o = r.output as Record<string, unknown>;
    const arr = (k: string) => ((o[k] as string[]) ?? []).join("; ");
    const note = `SEER self-challenge (${String(o["verdict"])}). Objection: ${String(o["strongest_objection"])} Rival explanation: ${String(o["rival_explanation"])} Fails when: ${arr("failure_conditions")} Counterexample: ${String(o["counterexample"])} Evidence needed: ${arr("evidence_needed")}`;
    if (await record("CHALLENGE", "NOTED", { notes: note, ai_run_id: r.runId, boundaries: arr("missing_boundaries") || null })) toast.success("SEER challenged its own method. Validate it yourself before activation.");
  }

  const steps = [
    ["1 Challenge", g.challenged], ["2 Validate with boundaries", g.validated], ["3 Owner activation", ["CANDIDATE", "CANONICAL"].includes(rule.status)], ["4 Generic transfer", rule.status === "CANONICAL" && rule.transfer_version === rule.version],
  ] as const;

  return (
    <div className="mt-3 space-y-2 border-t border-primary/30 pt-3">
      <div className="seer-label text-primary">Governed learning · version {rule.version}</div>
      <div className="flex flex-wrap gap-1.5">{steps.map(([l, ok]) => <span key={l} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${ok ? "border-primary text-primary" : "text-muted-foreground"}`}>{ok ? "✓ " : ""}{l}</span>)}</div>
      {g.blocked && <p className="rounded border border-destructive p-2 text-sm text-destructive">Withdrawn: a recorded outcome contradicts this method. Record a resolution, then challenge and validate again before any reuse.</p>}
      {rule.status === "STARTER" && <p className="text-xs text-muted-foreground">Built-in generic starter. It is reusable until contradicted; edits still create new versions.</p>}
      <Textarea rows={2} placeholder="Review note: the challenge, validation reasoning, transfer judgement or resolution" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Textarea rows={1} placeholder="Boundaries (required for a passing validation): where this holds and where it does not" value={bounds} onChange={(e) => setBounds(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={aiChallenge}>{busy ? "Challenging…" : "SEER challenges itself"}</Button>
        <Button size="sm" variant="outline" onClick={() => record("CHALLENGE", "NOTED")}>Record my challenge</Button>
        <Button size="sm" variant="outline" onClick={() => record("VALIDATION", "PASS")}>Validation passes</Button>
        <Button size="sm" variant="ghost" onClick={() => record("VALIDATION", "FAIL")}>Validation fails</Button>
        {g.blocked && <Button size="sm" variant="outline" onClick={() => record("RESOLUTION", "NOTED")}>Record resolution</Button>}
      </div>
      {g.validated && (
        <div className="rounded border p-2">
          <div className="seer-label">Generic transfer payload — only these six fields may cross projects</div>
          <dl className="mt-1 grid gap-1 text-xs md:grid-cols-2">{TRANSFER_FIELDS.map(([k, l]) => <div key={k}><dt className="text-muted-foreground">{l}</dt><dd>{String(rule[k] ?? "—")}</dd></div>)}</dl>
          {screen.length > 0 ? <p className="mt-1 text-xs text-destructive">Screening: {screen.join(" · ")}. Edit before transfer.</p> : <p className="mt-1 text-xs text-muted-foreground">Screening passed. Sources, client, outcomes and counterexamples stay behind.</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" disabled={screen.length > 0} onClick={() => record("TRANSFER_REVIEW", "PASS")}>Transfer review passes</Button>
            <Button size="sm" variant="ghost" onClick={() => record("TRANSFER_REVIEW", "FAIL")}>Transfer review fails</Button>
          </div>
        </div>
      )}
      {!!list.length && (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Review history ({list.length})</summary>
          <ul className="mt-1 space-y-1">{list.map((r) => <li key={r.id}><span className="font-mono text-primary">v{r.rule_version} {r.kind} {r.outcome}</span> · {new Date(r.created_at).toLocaleString()} — {r.notes}{r.boundaries ? ` Boundaries: ${r.boundaries}` : ""}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
