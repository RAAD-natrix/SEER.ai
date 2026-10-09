import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle } from "@/components/seer/AppShell";
import { PIPELINE } from "@/components/seer/StageTracker";

export const Route = createFileRoute("/_authenticated/backlog")({
  head: () => ({ meta: [{ title: "Backlog — SEER.ai" }, { name: "description", content: "Cases with unfinished AI stages." }, { property: "og:title", content: "Backlog — SEER.ai" }, { property: "og:description", content: "Cases with unfinished AI stages." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BacklogPage,
});

function BacklogPage() {
  const [who, setWho] = useState("");
  const q = useQuery({
    queryKey: ["backlog"],
    queryFn: async () => {
      const [cases, runs, finals] = await Promise.all([
        supabase.from("cases").select("id,title,client,assignee,stage_owners,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("ai_runs").select("case_id,stage,status").eq("status", "COMPLETED").not("case_id", "is", null),
        supabase.from("outputs").select("case_id,title,approved_at").eq("status", "FINAL — OWNER APPROVED"),
      ]);
      const done = new Map<string, Set<string>>();
      for (const r of runs.data ?? []) {
        if (!done.has(r.case_id!)) done.set(r.case_id!, new Set());
        done.get(r.case_id!)!.add(r.stage);
      }
      const fin = new Map<string, { title: string; approved_at: string | null }>();
      for (const f of finals.data ?? []) if (f.case_id) fin.set(f.case_id, f);
      return (cases.data ?? []).map((c) => {
        const d = done.get(c.id) ?? new Set();
        const left = PIPELINE.filter((p) => !d.has(p.stage));
        return { ...c, owners: (c.stage_owners ?? {}) as Record<string, string>, left, final: fin.get(c.id) ?? null, pct: Math.round(((PIPELINE.length - left.length) / PIPELINE.length) * 100) };
      }).filter((c) => c.left.length > 0 || c.final);
    },
  });
  const all = (q.data ?? []).filter((c) => !who || [c.assignee, ...Object.values(c.owners)].some((n) => n?.toLowerCase().includes(who.toLowerCase())));
  const rows = all.filter((c) => !c.final);
  const completed = all.filter((c) => c.final);
  return (
    <AppShell>
      <PageTitle label="BACKLOG" title="Cases with unfinished stages" />
      <input aria-label="Filter by owner" placeholder="Filter by owner name" value={who} onChange={(e) => setWho(e.target.value)} className="mb-4 h-9 w-full max-w-xs rounded-md border bg-background px-2 text-sm" />
      <div className="seer-panel divide-y">
        {rows.map((c) => {
          const next = c.left[0]!;
          return (
            <Link key={c.id} to="/work/$caseId" params={{ caseId: c.id }} className="block space-y-2 px-4 py-3 hover:bg-secondary">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div><div className="text-sm font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.client || "—"} · Owner: {c.assignee || "unassigned"}</div></div>
                <div className="font-mono text-xs text-muted-foreground">{c.pct}% · {c.left.length} left</div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${c.pct}%` }} /></div>
              <div className="text-xs">Next: <span className="text-primary">{next.label}</span> <span className="text-muted-foreground">({next.tab}{c.owners[next.tab] ? ` · ${c.owners[next.tab]}` : ""})</span></div>
            </Link>
          );
        })}
        {q.data && !rows.length && <p className="p-4 text-sm text-muted-foreground">No cases with unfinished stages.</p>}
        {!q.data && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      </div>
      <div className="seer-label mb-2 mt-8">COMPLETE — FINAL DELIVERABLE APPROVED</div>
      <div className="seer-panel divide-y">
        {completed.map((c) => (
          <Link key={c.id} to="/work/$caseId" params={{ caseId: c.id }} className="block px-4 py-3 hover:bg-secondary">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><div className="text-sm font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.final!.title} · Owner: {c.assignee || "unassigned"}</div></div>
              <div className="font-mono text-xs text-primary">✓ FINAL{c.final!.approved_at ? ` · ${new Date(c.final!.approved_at).toLocaleDateString("en-GB")}` : ""}</div>
            </div>
          </Link>
        ))}
        {q.data && !completed.length && <p className="p-4 text-sm text-muted-foreground">No case has an approved FINAL deliverable yet.</p>}
      </div>
    </AppShell>
  );
}
