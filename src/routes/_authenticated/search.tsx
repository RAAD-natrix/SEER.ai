import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle, StatusTag } from "@/components/seer/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportCsv } from "@/lib/seer/export";
import { uid } from "@/lib/seer/client";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — SEER.ai" }, { name: "description", content: "Find briefs, analyses and methods." }, { property: "og:title", content: "Search — SEER.ai" }, { property: "og:description", content: "Find briefs, analyses and methods." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Search,
});

type Filters = { q: string; from: string; to: string; types: string[]; owner: string };
type Hit = { type: string; id: string; title: string; snippet: string; date: string; caseId: string | null; status: string; owner: string };
const TYPES = ["CASE", "BRIEF", "TRIAGE", "SOURCE", "PATH", "STATE", "OUTPUT", "METHOD", "OPEN MIND"];

function snip(t: string, q: string) {
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? t.slice(0, 160) : `…${t.slice(Math.max(0, i - 60), i + 120)}…`;
}

async function runSearch(f: Filters): Promise<Hit[]> {
  const q = f.q.trim().replace(/[%,()]/g, " ");
  if (!q) return [];
  const like = `%${q}%`;
  const range = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(x: T, col: string) => {
    let y = x;
    if (f.from) y = y.gte(col, f.from);
    if (f.to) y = y.lte(col, `${f.to}T23:59:59`);
    return y;
  };
  const want = (t: string) => !f.types.length || f.types.includes(t);
  const hits: Hit[] = [];
  const jobs: Promise<void>[] = [];
  if (want("CASE")) jobs.push((async () => { const { data } = await range(supabase.from("cases").select("id,title,client,stage,created_at,owner_id").is("deleted_at", null).or(`title.ilike.${like},client.ilike.${like}`), "created_at"); data?.forEach((d) => hits.push({ type: "CASE", id: d.id, title: d.title, snippet: d.client ?? "", date: d.created_at, caseId: d.id, status: d.stage, owner: d.owner_id })); })());
  if (want("BRIEF") || want("TRIAGE")) jobs.push((async () => {
    const { data } = await range(supabase.from("brief_versions").select("id,case_id,version,raw_brief,triage,created_at,owner_id").limit(500), "created_at");
    data?.forEach((d) => {
      if (want("BRIEF") && d.raw_brief.toLowerCase().includes(q.toLowerCase())) hits.push({ type: "BRIEF", id: d.id, title: `Brief v${d.version}`, snippet: snip(d.raw_brief, q), date: d.created_at, caseId: d.case_id, status: `v${d.version}`, owner: d.owner_id });
      const t = d.triage ? JSON.stringify(d.triage) : "";
      if (want("TRIAGE") && t.toLowerCase().includes(q.toLowerCase())) hits.push({ type: "TRIAGE", id: d.id, title: `Initial analysis v${d.version}`, snippet: snip(t, q), date: d.created_at, caseId: d.case_id, status: "TRIAGE", owner: d.owner_id });
    });
  })());
  if (want("SOURCE")) jobs.push((async () => { const { data } = await range(supabase.from("sources").select("id,title,area,case_id,status,created_at,owner_id,extracted_text").is("deleted_at", null).or(`title.ilike.${like},extracted_text.ilike.${like}`).limit(100), "created_at"); data?.forEach((d) => hits.push({ type: "SOURCE", id: d.id, title: `${d.title} (${d.area})`, snippet: snip(d.extracted_text ?? d.title, q), date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })); })());
  if (want("PATH")) jobs.push((async () => { const { data } = await range(supabase.from("thought_paths").select("id,title,thesis,case_id,status,created_at,owner_id").or(`title.ilike.${like},thesis.ilike.${like}`), "created_at"); data?.forEach((d) => hits.push({ type: "PATH", id: d.id, title: d.title, snippet: d.thesis, date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })); })());
  if (want("STATE")) jobs.push((async () => { const { data } = await range(supabase.from("strategic_state_versions").select("id,case_id,version,state,created_at,owner_id").limit(300), "created_at"); data?.forEach((d) => { const t = JSON.stringify(d.state); if (t.toLowerCase().includes(q.toLowerCase())) hits.push({ type: "STATE", id: d.id, title: `Strategic state v${d.version}`, snippet: snip(t, q), date: d.created_at, caseId: d.case_id, status: `v${d.version}`, owner: d.owner_id }); }); })());
  if (want("OUTPUT")) jobs.push((async () => { const { data } = await range(supabase.from("outputs").select("id,title,content,case_id,status,created_at,owner_id").or(`title.ilike.${like},content.ilike.${like}`), "created_at"); data?.forEach((d) => hits.push({ type: "OUTPUT", id: d.id, title: d.title, snippet: snip(d.content, q), date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })); })());
  if (want("METHOD")) jobs.push((async () => { const { data } = await range(supabase.from("method_rules").select("id,name,mechanism,status,created_at,owner_id").or(`name.ilike.${like},mechanism.ilike.${like},use_when.ilike.${like}`), "created_at"); data?.forEach((d) => hits.push({ type: "METHOD", id: d.id, title: d.name, snippet: d.mechanism ?? "", date: d.created_at, caseId: null, status: d.status, owner: d.owner_id })); })());
  if (want("OPEN MIND")) jobs.push((async () => { const { data } = await range(supabase.from("openmind_items").select("id,title,content,kind,created_at,owner_id").or(`title.ilike.${like},content.ilike.${like}`), "created_at"); data?.forEach((d) => hits.push({ type: "OPEN MIND", id: d.id, title: d.title || d.kind, snippet: snip(d.content, q), date: d.created_at, caseId: null, status: d.kind, owner: d.owner_id })); })());
  await Promise.all(jobs);
  return hits.filter((h) => !f.owner || h.owner === f.owner).sort((a, b) => b.date.localeCompare(a.date));
}

function Search() {
  const [f, setF] = useState<Filters>({ q: "", from: "", to: "", types: [], owner: "" });
  const [active, setActive] = useState<Filters | null>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: async () => { const { data } = await supabase.auth.getUser(); const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user!.id).single(); return { id: data.user!.id, name: p?.display_name ?? "You" }; } });
  const results = useQuery({ queryKey: ["search", active], enabled: !!active, queryFn: () => runSearch(active!) });
  const views = useQuery({ queryKey: ["views"], queryFn: async () => (await supabase.from("saved_views").select("*").eq("scope", "search").order("created_at")).data ?? [] });
  const byType = (results.data ?? []).reduce<Record<string, number>>((a, h) => ({ ...a, [h.type]: (a[h.type] ?? 0) + 1 }), {});

  return (
    <AppShell>
      <PageTitle label="SEARCH" title="Find briefs, analyses and methods" />
      <form className="seer-panel mb-4 grid gap-3 p-4 md:grid-cols-[1fr_150px_150px_180px_auto]" onSubmit={(e) => { e.preventDefault(); setActive({ ...f }); }}>
        <div className="space-y-1"><Label htmlFor="sq">Keyword</Label><Input id="sq" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="sf">From</Label><Input id="sf" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="st">To</Label><Input id="st" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="so">Owner</Label><select id="so" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">Anyone I can see</option>{me.data && <option value={me.data.id}>{me.data.name} (me)</option>}</select></div>
        <div className="flex items-end"><Button type="submit" disabled={!f.q.trim()}>Search</Button></div>
        <div className="flex flex-wrap gap-1 md:col-span-5">
          {TYPES.map((t) => <button type="button" key={t} onClick={() => setF({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })} className={`rounded border px-2 py-0.5 font-mono text-xs ${f.types.includes(t) ? "border-primary text-primary" : "text-muted-foreground"}`}>{t}</button>)}
        </div>
      </form>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="seer-label">Saved views</span>
        {views.data?.map((v) => <button key={v.id} className="rounded border px-2 py-0.5" onClick={() => { const fl = v.filters as unknown as Filters; setF(fl); setActive(fl); }}>{v.name}</button>)}
        {active && <Button size="sm" variant="ghost" onClick={async () => { const name = prompt("Name this view"); if (!name) return; await supabase.from("saved_views").insert({ owner_id: await uid(), name, scope: "search", filters: active as never }); toast.success("View saved."); views.refetch(); }}>Save current view</Button>}
        {results.data && <Button size="sm" variant="ghost" onClick={() => exportCsv("search_results", results.data.map(({ owner: _o, ...r }) => r), active ?? {})}>Export results</Button>}
      </div>
      {results.isFetching && <p className="seer-label">Searching…</p>}
      {results.data && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{results.data.length} results · {Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
          <div className="seer-panel divide-y">
            {results.data.map((h) => (
              <div key={h.type + h.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary">{h.type}</span><StatusTag s={h.status} /><span className="seer-label">{new Date(h.date).toLocaleDateString("en-GB")}</span></div>
                {h.caseId ? <Link to="/work/$caseId" params={{ caseId: h.caseId }} className="text-sm font-medium hover:underline">{h.title}</Link> : <Link to={h.type === "METHOD" ? "/memory" : "/openmind"} className="text-sm font-medium hover:underline">{h.title}</Link>}
                <p className="text-xs text-muted-foreground">{h.snippet}</p>
              </div>
            ))}
            {!results.data.length && <p className="p-4 text-sm text-muted-foreground">No matches.</p>}
          </div>
        </>
      )}
    </AppShell>
  );
}
