import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Lets a recorded outcome support or contradict the methods SEER actually used on this case. */
export function OutcomeMethodFeedback({ caseId, outcomeId }: { caseId: string; outcomeId: string }) {
  const [reason, setReason] = useState<Record<string, string>>({});
  const used = useQuery({
    queryKey: ["case-methods", caseId],
    queryFn: async () => {
      const { data: runs } = await supabase.from("ai_runs").select("retrieved_method_ids").eq("case_id", caseId).eq("status", "COMPLETED");
      const ids = [...new Set((runs ?? []).flatMap((r) => r.retrieved_method_ids ?? []))];
      if (!ids.length) return [];
      return (await supabase.from("method_rules").select("id,name,status,owner_id,version").in("id", ids)).data ?? [];
    },
  });
  const reviews = useQuery({ queryKey: ["outcome-reviews", outcomeId], queryFn: async () => (await supabase.from("learning_reviews").select("method_rule_id,kind").eq("outcome_record_id", outcomeId)).data ?? [] });

  async function judge(ruleId: string, kind: "SUPPORT" | "CONTRADICTION") {
    const notes = reason[ruleId]?.trim();
    if (!notes) { toast.error("State why this outcome bears on the method."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("learning_reviews").insert({ owner_id: u.user!.id, method_rule_id: ruleId, kind, outcome: "NOTED", notes, case_id: caseId, outcome_record_id: outcomeId });
    if (error) { toast.error(error.message); return; }
    toast.success(kind === "CONTRADICTION" ? "Method withdrawn from reuse pending re-review." : "Support noted. Support alone never activates a method.");
    setReason({ ...reason, [ruleId]: "" }); reviews.refetch(); used.refetch();
  }

  if (!used.data?.length) return <p className="mt-2 text-xs text-muted-foreground">No learned methods were used on this case.</p>;
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <div className="seer-label">Methods SEER used here — does this outcome bear on them?</div>
      {used.data.map((m) => {
        const done = reviews.data?.filter((r) => r.method_rule_id === m.id).map((r) => r.kind) ?? [];
        return (
          <div key={m.id} className="space-y-1">
            <div className="text-xs"><span className="font-medium">{m.name}</span> <span className="font-mono text-muted-foreground">{m.status} v{m.version}</span>{done.length ? <span className="ml-1 text-primary">· {done.join(", ")}</span> : null}</div>
            <div className="flex gap-1">
              <Input className="h-8 text-xs" placeholder="Why (execution, context change and attribution considered)" value={reason[m.id] ?? ""} onChange={(e) => setReason({ ...reason, [m.id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => judge(m.id, "SUPPORT")}>Supports</Button>
              <Button size="sm" variant="destructive" onClick={() => judge(m.id, "CONTRADICTION")}>Contradicts</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
