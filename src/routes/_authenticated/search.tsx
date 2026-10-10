import { must } from "@/lib/seer/must";
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
import { runSearch, SEARCH_TYPES, type SearchFilters } from "@/lib/seer/search";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — SEER.ai" }, { name: "description", content: "Find briefs, analyses and methods." }, { property: "og:title", content: "Search — SEER.ai" }, { property: "og:description", content: "Find briefs, analyses and methods." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Search,
});

type Filters = SearchFilters;
const TYPES = SEARCH_TYPES;

function Search() {
  const [f, setF] = useState<Filters>({ q: "", from: "", to: "", types: [], owner: "" });
  const [active, setActive] = useState<Filters | null>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: async () => { const { data } = await supabase.auth.getUser(); const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user!.id).single(); return { id: data.user!.id, name: p?.display_name ?? "You" }; } });
  const results = useQuery({ queryKey: ["search", active], enabled: !!active, queryFn: () => runSearch(supabase, active!) });
  const hits = results.data?.hits;
  const views = useQuery({ queryKey: ["views"], queryFn: async () => (await supabase.from("saved_views").select("*").eq("scope", "search").order("created_at")).data ?? [] });
  const byType = (hits ?? []).reduce<Record<string, number>>((a, h) => ({ ...a, [h.type]: (a[h.type] ?? 0) + 1 }), {});

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
        {active && <Button size="sm" variant="ghost" onClick={async () => { const name = prompt("Name this view"); if (!name) return; await must(supabase.from("saved_views").insert({ owner_id: await uid(), name, scope: "search", filters: active as never })); toast.success("View saved."); views.refetch(); }}>Save current view</Button>}
        {hits && hits.length > 0 && <Button size="sm" variant="ghost" onClick={() => exportCsv("search_results", hits.map(({ owner: _o, ...r }) => r), active ?? {})}>Export results</Button>}
      </div>
      {results.isFetching && <p className="seer-label">Searching…</p>}
      {results.isError && <p role="alert" className="mb-2 text-sm text-destructive">Search could not run. Please retry.</p>}
      {results.data && results.data.failed.length > 0 && <p role="alert" className="mb-2 text-sm text-destructive">Some areas could not be searched ({results.data.failed.join(", ")}). Results below may be incomplete — please retry.</p>}
      {results.data && results.data.truncated.length > 0 && <p className="mb-2 text-xs text-muted-foreground">Showing the most recent matches only for {results.data.truncated.join(", ")}. Narrow the dates or types to see more.</p>}
      {hits && (
        <>
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">{hits.length} results · {Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
          <div className="seer-panel divide-y">
            {hits.map((h) => (
              <div key={h.type + h.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary">{h.type}</span><StatusTag s={h.status} /><span className="seer-label">{new Date(h.date).toLocaleDateString("en-GB")}</span></div>
                {h.caseId ? <Link to="/work/$caseId" params={{ caseId: h.caseId }} className="text-sm font-medium hover:underline">{h.title}</Link> : <Link to={h.type === "METHOD" ? "/memory" : "/openmind"} className="text-sm font-medium hover:underline">{h.title}</Link>}
                <p className="text-xs text-muted-foreground">{h.snippet}</p>
              </div>
            ))}
            {!hits.length && <p className="p-4 text-sm text-muted-foreground">{results.data?.failed.length ? "No matches in the areas that could be searched." : "No matches."}</p>}
          </div>
        </>
      )}
    </AppShell>
  );
}
