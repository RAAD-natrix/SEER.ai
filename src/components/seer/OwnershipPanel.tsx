import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { audit } from "@/lib/seer/client";

const TABS = ["BRIEF", "RESEARCH", "SANDBOX", "OUTCOMES"] as const;

export function OwnershipPanel({ caseId }: { caseId: string }) {
  const q = useQuery({
    queryKey: ["ownership", caseId],
    queryFn: async () => (await supabase.from("cases").select("assignee,stage_owners").eq("id", caseId).single()).data,
  });
  const [assignee, setAssignee] = useState("");
  const [owners, setOwners] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) { setAssignee(q.data.assignee ?? ""); setOwners((q.data.stage_owners ?? {}) as Record<string, string>); }
  }, [q.data]);
  async function save() {
    const { error } = await supabase.from("cases").update({ assignee: assignee.trim() || null, stage_owners: owners as never }).eq("id", caseId);
    if (error) { toast.error(error.message); return; }
    await audit("CASE_OWNERSHIP_SAVED", "case", caseId, { assignee, owners });
    toast.success("Ownership saved.");
    q.refetch();
  }
  return (
    <div className="seer-panel space-y-3 p-4">
      <div className="seer-label">Ownership</div>
      <div className="grid gap-2 md:grid-cols-5">
        <label className="space-y-1 text-xs">Case owner<Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Analyst name" /></label>
        {TABS.map((t) => (
          <label key={t} className="space-y-1 text-xs">{t} owner<Input value={owners[t] ?? ""} onChange={(e) => setOwners({ ...owners, [t]: e.target.value })} placeholder="—" /></label>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={!q.data}>Save ownership</Button>
    </div>
  );
}
