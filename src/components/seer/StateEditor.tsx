import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { audit, uid } from "@/lib/seer/client";

export const STATE_LABELS: [string, string][] = [
  ["mandate","Mandate"],["question_to_answer","Question to answer"],["stated_problem","Stated problem"],["current_reframe","Current reframe"],["symptoms","Symptoms"],["possible_causes","Possible causes"],["consequences","Consequences"],["constraints","Constraints"],["strong_and_protect","Strong — protect"],["verified_facts","Verified facts"],["reported_information","Reported information"],["direct_observations","Direct observations"],["inferences","Inferences"],["deductions","Deductions"],["contradictions","Contradictions"],["assumptions","Assumptions"],["unknowns","Unknowns"],["active_hypotheses","Active hypotheses"],["strongest_alternative_hypothesis","Strongest alternative"],["stakeholder_tensions","Stakeholder tensions"],["options","Options"],["risks","Risks"],["emerging_judgement","Emerging judgement"],["what_would_disprove_it","What would disprove it"],["now","NOW"],["next","NEXT"],["not_yet","NOT YET"],["decision_required","Decision required"],["confidence_wording","Confidence wording"],
];
// Single-text fields; every other field is a list (one item per line).
const TEXT_KEYS = new Set(["mandate","question_to_answer","brief_as_presented","stated_problem","current_reframe","strongest_alternative_hypothesis","emerging_judgement","decision_required","confidence_wording"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StateEditor({ caseId, current, version, onSaved, onCancel }: { caseId: string; current: any; version: number; onSaved: () => void; onCancel: () => void }) {
  const init: Record<string, string> = {};
  for (const [k] of STATE_LABELS) {
    const v = current?.[k];
    init[k] = Array.isArray(v) ? v.map(String).join("\n") : v ? String(v) : "";
  }
  const [vals, setVals] = useState(init);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!reason.trim()) { toast.error("Give a short reason for this edit."); return; }
    setSaving(true);
    try {
      const state: Record<string, unknown> = { ...(current ?? {}) };
      for (const [k] of STATE_LABELS) state[k] = TEXT_KEYS.has(k) ? vals[k]!.trim() : vals[k]!.split("\n").map((s) => s.trim()).filter(Boolean);
      const owner = await uid();
      const next = version + 1;
      // Never overwrite: every edit is a new immutable version.
      const { data, error } = await supabase.from("strategic_state_versions").insert({ owner_id: owner, case_id: caseId, version: next, state: state as never, reason: `Owner edit: ${reason.trim()}` }).select("id").single();
      if (error) throw error;
      await audit("STATE_EDITED", "strategic_state_version", data.id, { version: next });
      toast.success(`Strategic state v${next} saved.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Lists take one item per line. Saving creates v{version + 1}; earlier versions are kept.</p>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {STATE_LABELS.map(([k, l]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`st-${k}`}>{l}{TEXT_KEYS.has(k) ? "" : " (one per line)"}</Label>
            <Textarea id={`st-${k}`} rows={TEXT_KEYS.has(k) ? 2 : 3} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <Input aria-label="Reason for edit" placeholder="Reason for edit (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save new version"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
