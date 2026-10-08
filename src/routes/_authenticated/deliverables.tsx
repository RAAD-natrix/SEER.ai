import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle, StatusTag } from "@/components/seer/AppShell";

export const Route = createFileRoute("/_authenticated/deliverables")({
  head: () => ({ meta: [{ title: "Deliverables — SEER.ai" }, { name: "description", content: "Every deliverable by date, version and approval status." }] }),
  component: DeliverablesPage,
});

const d = (s?: string | null) => (s ? new Date(s).toLocaleString("en-GB") : "—");

function DeliverablesPage() {
  const [filter, setFilter] = useState<"final" | "all">("all");
  const q = useQuery({
    queryKey: ["deliverables-dash"],
    queryFn: async () => {
      const [o, c, v] = await Promise.all([
        supabase.from("outputs").select("id,case_id,title,status,version,approved_at,created_at,updated_at,readiness").order("updated_at", { ascending: false }),
        supabase.from("cases").select("id,title,client").is("deleted_at", null),
        supabase.from("output_versions").select("output_id,version,created_at"),
      ]);
      const cases = new Map((c.data ?? []).map((x) => [x.id, x]));
      const vc = new Map<string, number>();
      for (const x of v.data ?? []) vc.set(x.output_id, (vc.get(x.output_id) ?? 0) + 1);
      return (o.data ?? []).filter((x) => cases.has(x.case_id)).map((x) => ({ ...x, kase: cases.get(x.case_id)!, versions: vc.get(x.id) ?? 0 }));
    },
  });
  const rows = (q.data ?? []).filter((x) => filter === "all" || x.status === "FINAL — OWNER APPROVED");
  return (
    <AppShell>
      <PageTitle label="DELIVERABLES" title="All deliverables by date and version" />
      <div className="mb-4 flex gap-1">
        {(["all", "final"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded border px-3 py-1 font-mono text-xs ${filter === f ? "border-primary text-primary" : "text-muted-foreground"}`}>{f === "all" ? "ALL" : "FINAL ONLY"}</button>)}
      </div>
      <div className="seer-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="seer-label text-left"><th className="p-3">Deliverable</th><th className="p-3">Case</th><th className="p-3">Status</th><th className="p-3">Version</th><th className="p-3">Readiness</th><th className="p-3">Created</th><th className="p-3">Last change</th><th className="p-3">Approved</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((x) => (
              <tr key={x.id} className="hover:bg-secondary">
                <td className="p-3"><Link to="/deliverable/$outputId" params={{ outputId: x.id }} className="hover:text-primary">{x.title}</Link></td>
                <td className="p-3 text-xs text-muted-foreground">{x.kase.title}</td>
                <td className="p-3"><StatusTag s={x.status} /></td>
                <td className="p-3 font-mono text-xs">v{x.version} · {x.versions} saved</td>
                <td className="p-3 font-mono text-xs">{(x.readiness as { index?: number } | null)?.index ?? "—"}</td>
                <td className="p-3 text-xs">{d(x.created_at)}</td>
                <td className="p-3 text-xs">{d(x.updated_at)}</td>
                <td className="p-3 text-xs">{d(x.approved_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.data && !rows.length && <p className="p-4 text-sm text-muted-foreground">No deliverables here yet.</p>}
        {!q.data && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      </div>
    </AppShell>
  );
}
