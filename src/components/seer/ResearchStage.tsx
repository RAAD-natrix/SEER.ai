import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Block, Bullets, StatusTag } from "./AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACCEPT } from "@/lib/seer/extract";
import { createTextSource, deleteSource, uploadSource } from "@/lib/seer/sources";
import { exportCsv } from "@/lib/seer/export";
import { uid, useStage } from "@/lib/seer/client";

const ROUTES = [
  ["A", "Update active thought path"],
  ["B", "Create new thought path from this research"],
  ["C", "Add to case research library only"],
  ["D", "Apply to selected existing paths"],
] as const;

export function ResearchStage({ caseId, activePathId }: { caseId: string; activePathId: string | null }) {
  const { run, busy } = useStage();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [route, setRoute] = useState<string>("");
  const [pathSel, setPathSel] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState({ classification: "", direction: "" });

  const sources = useQuery({ queryKey: ["research", caseId], queryFn: async () => (await supabase.from("sources").select("*").eq("case_id", caseId).eq("area", "research").is("deleted_at", null).order("created_at", { ascending: false })).data ?? [] });
  const paths = useQuery({ queryKey: ["paths", caseId], queryFn: async () => (await supabase.from("thought_paths").select("id,title,status").eq("case_id", caseId).order("created_at")).data ?? [] });
  const evidence = useQuery({ queryKey: ["evidence", caseId], queryFn: async () => (await supabase.from("evidence_items").select("*").eq("case_id", caseId).order("created_at", { ascending: false })).data ?? [] });
  const s = sources.data?.find((x) => x.id === sel);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = s?.delta as any;
  const evView = (evidence.data ?? []).filter((e) => (!filter.classification || e.classification === filter.classification) && (!filter.direction || e.direction === filter.direction));

  async function add() {
    if (!route) { toast.error("Choose how this research should be routed."); return; }
    if (route === "A" && !activePathId) { toast.error("No active thought path. Create one in SANDBOX or choose another route."); return; }
    const pathIds = route === "A" ? [activePathId!] : route === "D" ? pathSel : [];
    try {
      const src = file
        ? (await uploadSource(file, { area: "research", caseId, title: title || file.name, routing: route, pathIds, ...(date ? { sourceDate: date } : {}) })).source
        : await createTextSource(text, { area: "research", caseId, title: title || "Research note", routing: route, pathIds });
      setFile(null); setText(""); setTitle("");
      await sources.refetch();
      setSel(src.id);
      if (!src.extracted_text) { toast.warning("Stored, but no text could be extracted for analysis."); return; }
      const r = await run({ stage: "RESEARCH_DELTA", caseId, sourceId: src.id, ...(activePathId ? { pathId: activePathId } : {}) });
      if (!r) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = r.output as any;
      await supabase.from("sources").update({ delta: o, reliability_notes: o.reliability_notes }).eq("id", src.id);
      const owner = await uid();
      if (o.evidence?.length) {
        await supabase.from("evidence_items").insert(o.evidence.map((e: Record<string, unknown>) => ({
          owner_id: owner, case_id: caseId, statement: String(e["statement"]), source_id: src.id, source_label: src.title, source_type: src.source_type,
          classification: String(e["classification"]), direction: String(e["direction"]),
          strength: Math.round(Math.min(5, Math.max(1, Number(e["strength"]) || 3))),
          reliability: Math.min(0.95, Math.max(0.2, Number(e["reliability"]) || 0.5)),
          independence: Math.min(1, Math.max(0.25, Number(e["independence"]) || 1)),
          limitation: String(e["limitation"] ?? ""), path_ids: pathIds,
        })));
      }
      if (route === "B") await createPath(o.suggested_path_title || src.title, o.suggested_path_thesis || "", src.id);
      toast.success("Research delta ready.");
      sources.refetch(); evidence.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function createPath(t: string, thesis: string, sourceId: string) {
    const owner = await uid();
    const { data } = await supabase.from("thought_paths").insert({ owner_id: owner, case_id: caseId, title: t, thesis }).select("id").single();
    if (data) {
      await supabase.from("sources").update({ path_ids: [...(s?.path_ids ?? []), data.id] }).eq("id", sourceId);
      await supabase.from("cases").update({ active_path_id: data.id }).eq("id", caseId);
      toast.success("New thought path created.");
      paths.refetch();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <div className="seer-panel space-y-3 p-4">
          <div className="seer-label">Add research</div>
          <Input type="file" accept={ACCEPT} aria-label="Research file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {!file && <Textarea rows={4} placeholder="…or paste research text" value={text} onChange={(e) => setText(e.target.value)} />}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="rt">Title</Label><Input id="rt" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="rd">Source date</Label><Input id="rd" value={date} onChange={(e) => setDate(e.target.value)} placeholder="if known" /></div>
          </div>
          <fieldset className="space-y-1">
            <legend className="seer-label mb-1">Routing (required)</legend>
            {ROUTES.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="route" checked={route === k} onChange={() => setRoute(k)} /> {k}. {l}</label>
            ))}
            {route === "D" && (
              <div className="ml-5 space-y-1">
                {paths.data?.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pathSel.includes(p.id)} onChange={(e) => setPathSel(e.target.checked ? [...pathSel, p.id] : pathSel.filter((x) => x !== p.id))} /> {p.title}</label>
                ))}
              </div>
            )}
          </fieldset>
          <Button className="w-full" disabled={(!file && !text.trim()) || !!busy} onClick={add}>{busy ? "Analysing…" : "Add & analyse"}</Button>
        </div>
        <div className="seer-panel divide-y">
          {sources.data?.length ? sources.data.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`block w-full px-3 py-2 text-left hover:bg-secondary ${sel === x.id ? "bg-secondary" : ""}`}>
              <div className="truncate text-sm">{x.title}</div>
              <div className="mt-1 flex gap-1.5"><StatusTag s={x.status} /><span className="seer-label">Route {x.routing}</span></div>
            </button>
          )) : <p className="p-3 text-sm text-muted-foreground">No research yet.</p>}
        </div>
      </div>

      <div className="space-y-4">
        {s && (
          <div className="seer-panel space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-medium">{s.title}</h2><div className="seer-label">{s.source_date || "date unknown"} · uploaded {new Date(s.created_at).toLocaleDateString("en-GB")}</div></div>
              <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete this source?")) { await deleteSource(s.id); setSel(null); sources.refetch(); } }}>Delete</Button>
            </div>
            {!d ? <p className="text-sm text-muted-foreground">No delta yet.</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                <Block label="What is genuinely new?"><Bullets items={d.genuinely_new} /></Block>
                <Block label="Supports the current path"><Bullets items={d.supports_current_path} /></Block>
                <Block label="Contradicts it"><Bullets items={d.contradicts_current_path} /></Block>
                <Block label="Less certain"><Bullets items={d.less_certain} /></Block>
                <Block label="More certain"><Bullets items={d.more_certain} /></Block>
                <Block label="Prior assumption weakened"><Bullets items={d.weakened_assumption} /></Block>
                <Block label="Merely repetition"><Bullets items={d.mere_repetition} /></Block>
                <Block label="New question that matters"><Bullets items={d.new_question} /></Block>
                <Block label="New hypothesis justified"><p className="text-sm">{d.new_hypothesis || "—"}</p></Block>
                <Block label="Key claims"><Bullets items={d.key_claims} /></Block>
                <Block label="Can establish"><Bullets items={d.can_establish} /></Block>
                <Block label="Cannot establish"><Bullets items={d.cannot_establish} /></Block>
                <Block label="Reliability notes"><p className="text-sm">{d.reliability_notes}</p></Block>
                {d.justifies_new_path && s.routing !== "B" && (
                  <div className="rounded border border-primary p-3 md:col-span-2">
                    <div className="seer-label text-primary">Suggested new path</div>
                    <p className="text-sm font-medium">{d.suggested_path_title}</p>
                    <p className="text-sm text-muted-foreground">{d.suggested_path_thesis}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => createPath(d.suggested_path_title, d.suggested_path_thesis, s.id)}>Create path</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("sources").update({ delta: { ...d, justifies_new_path: false, suggestion_rejected: true } }).eq("id", s.id); sources.refetch(); }}>Reject suggestion</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="seer-panel p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="seer-label mr-auto">Evidence register · {evView.length} of {evidence.data?.length ?? 0}</div>
            <select aria-label="Classification filter" className="h-8 rounded border bg-background px-2 text-xs" value={filter.classification} onChange={(e) => setFilter({ ...filter, classification: e.target.value })}>
              <option value="">All classes</option>{["BRIEF FACT","VERIFIED","REPORTED","OBSERVED","INFERRED","DEDUCED","CONTRADICTED","UNKNOWN"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select aria-label="Direction filter" className="h-8 rounded border bg-background px-2 text-xs" value={filter.direction} onChange={(e) => setFilter({ ...filter, direction: e.target.value })}>
              <option value="">All directions</option><option>SUPPORTS</option><option>CONTRADICTS</option><option>NEUTRAL</option>
            </select>
            <Button size="sm" variant="outline" onClick={() => exportCsv("evidence", evView, filter)}>Export view</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="seer-label text-left"><th className="py-1 pr-2">Statement</th><th className="pr-2">Class</th><th className="pr-2">Dir</th><th className="pr-2">Str</th><th className="pr-2">Rel</th><th className="pr-2">Ind</th><th>Source</th></tr></thead>
              <tbody>
                {evView.map((e) => (
                  <tr key={e.id} className="border-t align-top">
                    <td className="py-1.5 pr-2">{e.statement}{e.limitation && <div className="text-xs text-muted-foreground">Limit: {e.limitation}</div>}</td>
                    <td className="pr-2 font-mono text-xs">{e.classification}</td>
                    <td className={`pr-2 font-mono text-xs ${e.direction === "CONTRADICTS" ? "text-destructive" : e.direction === "SUPPORTS" ? "text-primary" : ""}`}>{e.direction}</td>
                    <td className="pr-2">{e.strength}</td><td className="pr-2">{Number(e.reliability).toFixed(2)}</td><td className="pr-2">{Number(e.independence).toFixed(2)}</td>
                    <td className="text-xs text-muted-foreground">{e.source_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!evView.length && <p className="py-2 text-sm text-muted-foreground">No evidence matches.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
