import { must } from "@/lib/seer/must";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle, StatusTag } from "@/components/seer/AppShell";
import { MethodCard } from "@/components/seer/MethodCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { exportCsv } from "@/lib/seer/export";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({ meta: [{ title: "Memory — SEER.ai" }, { name: "description", content: "Method memory and learning history." }, { property: "og:title", content: "Memory — SEER.ai" }, { property: "og:description", content: "Method memory and learning history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Memory,
});

const STATUSES = ["", "STARTER", "PENDING_REVIEW", "CANDIDATE", "CANONICAL", "WITHDRAWN", "BLOCKED_FOR_GENERAL_REUSE", "CASE_ONLY", "RETIRED"];
const CLASSES = ["", "METHOD", "STYLE", "TEMPLATE", "CASE_REFERENCE", "COUNTEREXAMPLE", "SYSTEM_FAILURE"];

function Memory() {
  const [tab, setTab] = useState<"methods" | "events">("methods");
  const [status, setStatus] = useState("");
  const [cls, setCls] = useState("");
  const [q, setQ] = useState("");
  const rules = useQuery({ queryKey: ["rules"], queryFn: async () => (await supabase.from("method_rules").select("*").order("updated_at", { ascending: false })).data ?? [] });
  const events = useQuery({ queryKey: ["events"], queryFn: async () => (await supabase.from("learning_events").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [] });
  const view = (rules.data ?? []).filter((r) => (!status || r.status === status) && (!cls || r.memory_class === cls) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const counts = STATUSES.slice(1).map((s) => [s, (rules.data ?? []).filter((r) => r.status === s).length] as const);

  return (
    <AppShell>
      <PageTitle label="MEMORY" title="Method memory and learning">
        <div className="flex gap-1">{(["methods", "events"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded border px-3 py-1 font-mono text-xs ${tab === t ? "border-primary text-primary" : "text-muted-foreground"}`}>{t.toUpperCase()}</button>)}</div>
      </PageTitle>
      {tab === "methods" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{counts.map(([s, n]) => <button key={s} onClick={() => setStatus(s)}><StatusTag s={`${s} ${n}`} /></button>)}</div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Search methods…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Status" className="h-9 rounded border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</select>
            <select aria-label="Class" className="h-9 rounded border bg-background px-2 text-sm" value={cls} onChange={(e) => setCls(e.target.value)}>{CLASSES.map((s) => <option key={s} value={s}>{s || "All classes"}</option>)}</select>
            <Button variant="outline" onClick={() => exportCsv("methods", view, { status, cls, q })}>Export view ({view.length})</Button>
          </div>
          <div className="space-y-3">{view.map((r) => <MethodCard key={r.id + r.version + r.status} rule={r} onChange={() => rules.refetch()} />)}{!view.length && <p className="text-sm text-muted-foreground">No methods match.</p>}</div>
        </>
      ) : (
        <div className="seer-panel overflow-x-auto p-3">
          <table className="w-full text-sm">
            <thead><tr className="seer-label text-left"><th className="py-1 pr-2">Date</th><th className="pr-2">Type</th><th className="pr-2">Context</th><th className="pr-2">Revised proposition</th><th className="pr-2">Scope</th><th>Confirmed</th></tr></thead>
            <tbody>{events.data?.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="py-1.5 pr-2 text-xs">{new Date(e.created_at).toLocaleString("en-GB")}</td>
                <td className="pr-2 font-mono text-xs">{e.event_type}</td>
                <td className="pr-2 text-xs">{e.context}</td>
                <td className="pr-2">{e.revised_proposition}{e.owner_response && <div className="text-xs text-muted-foreground">Owner: {e.owner_response}</div>}</td>
                <td className="pr-2 font-mono text-xs">{e.scope}</td>
                <td>{e.confirmed ? "yes" : <button className="text-xs underline" onClick={async () => { await must(supabase.from("learning_events").update({ confirmed: true }).eq("id", e.id)); events.refetch(); }}>confirm</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!events.data?.length && <p className="text-sm text-muted-foreground">No learning events yet.</p>}
        </div>
      )}
    </AppShell>
  );
}
