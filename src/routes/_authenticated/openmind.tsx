import { must } from "@/lib/seer/must";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageTitle, StatusTag } from "@/components/seer/AppShell";
import { fullScan } from "@/components/seer/MethodCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACCEPT } from "@/lib/seer/extract";
import { uploadSource } from "@/lib/seer/sources";
import { ConsentChoice, type Consent } from "@/components/seer/ConsentChoice";
import { audit, uid, useStage } from "@/lib/seer/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/openmind")({
  head: () => ({ meta: [{ title: "Open Mind — SEER.ai" }, { name: "description", content: "Explore ideas not yet attached to a job." }, { property: "og:title", content: "Open Mind — SEER.ai" }, { property: "og:description", content: "Explore ideas not yet attached to a job." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: OpenMind,
});

const KINDS = ["EXTERNAL FACT OR SOURCE", "OWNER THOUGHT", "SEER HYPOTHESIS", "ANALOGY", "METHOD CANDIDATE", "QUESTION", "COUNTEREXAMPLE"];

function OpenMind() {
  const { run, busy } = useStage();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("OWNER THOUGHT");
  const [consent, setConsent] = useState<Consent>("LOCAL_ONLY");
  const [file, setFile] = useState<File | null>(null);
  const [parent, setParent] = useState<Tables<"openmind_items"> | null>(null);
  const [filter, setFilter] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const items = useQuery({ queryKey: ["om"], queryFn: async () => (await supabase.from("openmind_items").select("*").order("created_at", { ascending: false })).data ?? [] });
  const cases = useQuery({ queryKey: ["cases-min"], queryFn: async () => (await supabase.from("cases").select("id,title").is("deleted_at", null)).data ?? [] });

  async function add(explore: boolean) {
    if (!text.trim() && !file) return;
    const owner = await uid();
    let sourceId: string | null = null;
    let aiSource = false;
    let content = text;
    if (file) {
      try {
        const { source } = await uploadSource(file, { area: "openmind", title: title || file.name, consent });
        sourceId = source.id;
        aiSource = source.processing_consent === "ALLOWED_AI";
        content = text || `File: ${source.title} (${source.status})`;
      } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); return; }
    }
    const { data: item } = await supabase.from("openmind_items").insert({ owner_id: owner, kind: file ? "EXTERNAL FACT OR SOURCE" : kind, title: title || null, content, url: url || null, source_id: sourceId, parent_id: parent?.id ?? null }).select("id").single();
    setText(""); setTitle(""); setUrl(""); setFile(null);
    if (explore && item) {
      const r = await run({ stage: "OPEN_MIND_STUDY", ...(sourceId && aiSource ? { sourceId } : {}), text: `${parent ? `Branching from: ${parent.content}\n\n` : ""}${content}` });
      if (r) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = r.output as any;
        setReply(o.reply);
        if (o.items?.length) await must(supabase.from("openmind_items").insert(o.items.map((i: { kind: string; text: string }) => ({ owner_id: owner, kind: i.kind, content: i.text, parent_id: item.id }))));
      }
    }
    setParent(null);
    items.refetch();
  }

  async function promote(i: Tables<"openmind_items">) {
    const r = await run({ stage: "LEARNING_EXTRACT", text: `Owner wants to promote this Open Mind insight into a generic method candidate. Insight: ${i.content}` });
    if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (r.output as any).candidate_method;
    const scan = await fullScan(m, run);
    const owner = await uid();
    const { data } = await supabase.from("method_rules").insert({ owner_id: owner, ...m, memory_class: "METHOD", status: scan.blocked ? "BLOCKED_FOR_GENERAL_REUSE" : "PENDING_REVIEW", contamination: scan as never, tags: ["open-mind"] }).select("id").single();
    await must(supabase.from("openmind_items").update({ method_rule_id: data?.id ?? null }).eq("id", i.id));
    await must(supabase.from("learning_events").insert({ owner_id: owner, event_type: "METHOD_CANDIDATE", context: "Open Mind promotion", revised_proposition: m.mechanism, method_rule_id: data?.id ?? null, scope: "CANDIDATE" }));
    toast.success(scan.blocked ? "Created but blocked by contamination scan — review in Memory." : "Method candidate created — review in Memory.");
    items.refetch();
  }

  const view = (items.data ?? []).filter((i) => !filter || i.kind === filter);
  const roots = view.filter((i) => !i.parent_id || !view.some((p) => p.id === i.parent_id));
  const children = (id: string) => view.filter((i) => i.parent_id === id);

  function Item({ i, depth }: { i: Tables<"openmind_items">; depth: number }) {
    return (
      <div style={{ marginLeft: depth * 16 }} className="border-l pl-3">
        <div className="py-2">
          <div className="flex flex-wrap items-center gap-2"><StatusTag s={i.kind} />{i.reusable && <StatusTag s="REUSABLE" />}{i.method_rule_id && <span className="seer-label">→ method</span>}<span className="seer-label">{new Date(i.created_at).toLocaleDateString("en-GB")}</span></div>
          {i.title && <div className="mt-1 text-sm font-medium">{i.title}</div>}
          <p className="whitespace-pre-wrap text-sm">{i.content}</p>
          {i.url && <a className="text-xs text-primary underline" href={i.url} target="_blank" rel="noreferrer noopener">{i.url}</a>}
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setParent(i)}>Branch</button>
            <button className="text-muted-foreground hover:text-foreground" onClick={async () => { await must(supabase.from("openmind_items").update({ reusable: !i.reusable }).eq("id", i.id)); await audit("OPENMIND_REUSABLE_CHANGED", "openmind_item", i.id, { reusable: !i.reusable }); items.refetch(); }}>{i.reusable ? "Unmark reusable" : "Mark reusable across cases"}</button>
            {!i.method_rule_id && <button className="text-muted-foreground hover:text-foreground" disabled={!!busy} onClick={() => promote(i)}>Promote to method candidate</button>}
            <select aria-label="Move to case" className="rounded border bg-background text-xs" value={i.case_id ?? ""} onChange={async (e) => {
              const cid = e.target.value || null;
              await must(supabase.from("openmind_items").update({ case_id: cid }).eq("id", i.id));
              if (cid) { const owner = await uid(); await must(supabase.from("sources").insert({ owner_id: owner, case_id: cid, area: "research", title: i.title || `Open Mind: ${i.kind}`, source_type: "OPEN MIND", status: "EXTRACTED", extracted_text: i.content, routing: "C", coverage: { total_units: 1, extracted_units: 1, coverage_percent: 100, unit: "text" } })); toast.success("Copied into the case research library."); }
              items.refetch();
            }}>
              <option value="">Move to case…</option>{cases.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
        {children(i.id).map((c) => <Item key={c.id} i={c} depth={1} />)}
      </div>
    );
  }

  return (
    <AppShell>
      <PageTitle label="OPEN MIND" title="Explore ideas and evidence that do not yet belong to a job" />
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-3">
          <div className="seer-panel space-y-2 p-4">
            {parent && <div className="rounded border border-primary p-2 text-xs">Branching from: {parent.content.slice(0, 120)} <button className="ml-2 min-h-11 px-2 underline" onClick={() => setParent(null)}>cancel</button></div>}
            <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea rows={6} placeholder="An idea, observation, provocation or excerpt…" value={text} onChange={(e) => setText(e.target.value)} />
            <Input placeholder="URL / reference (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input type="file" accept={ACCEPT} aria-label="File" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <ConsentChoice name="openmind-consent" value={consent} onChange={setConsent} />}
            <select aria-label="Kind" className="min-h-11 w-full rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <div className="flex gap-2"><Button onClick={() => add(true)} disabled={!!busy}>{busy ? "Exploring…" : "Save & explore with SEER"}</Button><Button variant="outline" onClick={() => add(false)}>Save only</Button></div>
            <p className="text-xs text-muted-foreground">External research is not a personal method. Items stay out of cases unless marked reusable or moved.</p>
          </div>
          {reply && <div className="seer-panel p-4 text-sm"><div className="seer-label mb-1">SEER</div><p className="whitespace-pre-wrap">{reply}</p></div>}
        </div>
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            <button onClick={() => setFilter("")} className={`rounded border px-2 py-0.5 font-mono text-xs ${!filter ? "border-primary text-primary" : "text-muted-foreground"}`}>ALL</button>
            {KINDS.map((k) => <button key={k} onClick={() => setFilter(k)} className={`rounded border px-2 py-0.5 font-mono text-xs ${filter === k ? "border-primary text-primary" : "text-muted-foreground"}`}>{k}</button>)}
          </div>
          <div className="seer-panel p-3">{roots.length ? roots.map((i) => <Item key={i.id} i={i} depth={0} />) : <p className="text-sm text-muted-foreground">Nothing here yet.</p>}</div>
        </div>
      </div>
    </AppShell>
  );
}
