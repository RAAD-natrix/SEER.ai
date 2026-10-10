import { must } from "@/lib/seer/must";
import { useQuery } from "@tanstack/react-query";
import { AnalysisPanel } from "./AnalysisPanel";
import { useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Block, Bullets, StatusTag } from "./AppShell";
import { fullScan } from "./MethodCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { audit, uid, useStage } from "@/lib/seer/client";
import { StateEditor, STATE_LABELS } from "./StateEditor";
import type { Tables } from "@/integrations/supabase/types";

type Path = Tables<"thought_paths">;
const KINDS = ["THOUGHT","QUESTION","EVIDENCE","OBSERVATION","CORRECTION","CHALLENGE","HYPOTHESIS","ANALOGY","CONSTRAINT","INSTRUCTION","DECISION"];
const ACTIONS = ["ACCEPT","CHALLENGE","REVISE","REJECT","PIN","PARK","ADD TO EVIDENCE","ADD TO UNKNOWN","CREATE PATH","MAKE METHOD CANDIDATE","MAKE CANONICAL PRINCIPLE"];

export function SandboxStage({ caseId, activePathId, onActive }: { caseId: string; activePathId: string | null; onActive: (id: string) => void }) {
  const { run, busy } = useStage();
  const [tab, setTab] = useState<"state" | "path" | "redteam">("state");
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState("THOUGHT");
  const [checked, setChecked] = useState<string[]>([]);
  const [compare, setCompare] = useState<Record<string, unknown> | null>(null);
  const [closeDraft, setCloseDraft] = useState<Record<string, string> | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [diff, setDiff] = useState<[number, number] | null>(null);
  const [editing, setEditing] = useState(false);

  const paths = useQuery({ queryKey: ["paths-full", caseId], queryFn: async () => (await supabase.from("thought_paths").select("*").eq("case_id", caseId).order("created_at")).data ?? [] });
  const active = paths.data?.find((p) => p.id === activePathId) ?? null;
  const msgs = useQuery({ queryKey: ["msgs", activePathId], enabled: !!activePathId, queryFn: async () => (await supabase.from("sandbox_messages").select("*").eq("path_id", activePathId!).order("created_at")).data ?? [] });
  const states = useQuery({ queryKey: ["states", caseId], queryFn: async () => (await supabase.from("strategic_state_versions").select("*").eq("case_id", caseId).order("version", { ascending: false })).data ?? [] });
  const pv = useQuery({ queryKey: ["pv", activePathId], enabled: !!activePathId, queryFn: async () => (await supabase.from("path_versions").select("*").eq("path_id", activePathId!).order("created_at", { ascending: false })).data ?? [] });

  const refresh = () => { paths.refetch(); msgs.refetch(); pv.refetch(); };

  async function snapshot(p: Path, reason: string) {
    await must(supabase.from("path_versions").insert({ owner_id: p.owner_id, path_id: p.id, version: p.version, snapshot: p as never, reason }));
  }
  async function newPath(title: string, thesis = "", parent?: Path, mergedFrom: string[] = [], detail: Record<string, unknown> = {}) {
    const owner = await uid();
    const { data, error } = await supabase.from("thought_paths").insert({ owner_id: owner, case_id: caseId, title, thesis, parent_ids: parent ? [parent.id] : mergedFrom, merged_from: mergedFrom, detail: detail as never }).select("id").single();
    if (error) { toast.error(error.message); return; }
    onActive(data.id);
    refresh();
  }
  async function setStatus(p: Path, status: string, patch: Partial<Path> = {}) {
    await snapshot(p, `${p.status} → ${status}`);
    await must(supabase.from("thought_paths").update({ status, ...patch }).eq("id", p.id));
    await audit(`PATH_${status}`, "thought_path", p.id);
    refresh();
  }

  async function send() {
    if (!active || !msg.trim()) return;
    const owner = await uid();
    await must(supabase.from("sandbox_messages").insert({ owner_id: owner, case_id: caseId, path_id: active.id, role: "owner", kind, content: msg }));
    const text = `[${kind}] ${msg}`;
    setMsg("");
    msgs.refetch();
    const r = await run({ stage: "PATH_DISCUSS", caseId, pathId: active.id, text });
    if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = r.output as any;
    const content = o.reply + (o.challenges?.length ? `\n\n**Challenges**\n${o.challenges.map((c: string) => `- ${c}`).join("\n")}` : "");
    await must(supabase.from("sandbox_messages").insert({ owner_id: owner, case_id: caseId, path_id: active.id, role: "seer", kind: "RESPONSE", content, basis: o.basis, prior_learning: { used: o.prior_learning_used, retrieved: r.retrieved, model: r.model }, ai_run_id: r.runId }));
    msgs.refetch();
  }

  async function makeMethod(content: string, canonical: boolean, ownerResponse = "") {
    const r = await run({ stage: "LEARNING_EXTRACT", caseId, text: `SEER proposition: ${content}\nOwner response: ${ownerResponse || (canonical ? "Make this a canonical principle." : "Make this a method candidate.")}` });
    if (!r) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = r.output as any;
    const owner = await uid();
    let ruleId: string | null = null;
    if (o.has_method || canonical || ownerResponse === "") {
      const m = o.candidate_method;
      const scan = await fullScan(m, run);
      // New learning always starts case-scoped and unreviewed; activation happens through governed review in Memory.
      const status = scan.blocked ? "BLOCKED_FOR_GENERAL_REUSE" : "PENDING_REVIEW";
      const { data } = await supabase.from("method_rules").insert({ owner_id: owner, name: m.name, problem_type: m.problem_type, mechanism: m.mechanism, why_useful: m.why_useful, prerequisites: m.prerequisites, use_when: m.use_when, do_not_use_when: m.do_not_use_when, counterexamples: m.counterexamples, required_evidence: m.required_evidence, falsifier: m.falsifier, contamination: scan as never, status, case_id: caseId }).select("id").single();
      ruleId = data?.id ?? null;
      if (scan.blocked) toast.warning("Method card blocked by contamination scan — review it in Memory.");
      else toast.success(canonical ? "Principle drafted. Challenge, validate and approve it in Memory before reuse." : "Method candidate created for review in Memory.");
    }
    await must(supabase.from("learning_events").insert({ owner_id: owner, case_id: caseId, event_type: canonical ? "CANONICAL_PRINCIPLE" : o.event_type, context: "Sandbox", previous_proposition: content.slice(0, 2000), owner_response: ownerResponse, revised_proposition: o.revised_proposition, reason: o.reason, method_rule_id: ruleId, confirmed: canonical, scope: ruleId ? "CANDIDATE" : "CASE" }));
    return o;
  }

  async function act(m: Tables<"sandbox_messages">, action: string) {
    if (!active) return;
    const owner = await uid();
    let note = "";
    if (["CHALLENGE", "REVISE", "REJECT"].includes(action)) {
      note = prompt(`${action}: what is your response?`) ?? "";
      if (!note) return;
      await must(supabase.from("sandbox_messages").insert({ owner_id: owner, case_id: caseId, path_id: active.id, role: "owner", kind: action === "REJECT" ? "CORRECTION" : "CHALLENGE", content: `${action}: ${note}` }));
      await makeMethod(m.content, false, note);
    }
    if (action === "ADD TO EVIDENCE") await must(supabase.from("evidence_items").insert({ owner_id: owner, case_id: caseId, statement: m.content.slice(0, 1000), source_label: "SEER sandbox response", classification: "INFERRED", path_ids: [active.id] }));
    if (action === "ADD TO UNKNOWN") {
      const d = (active.detail ?? {}) as Record<string, unknown>;
      await must(supabase.from("thought_paths").update({ detail: { ...d, unknowns: [...((d["unknowns"] as string[]) ?? []), m.content.slice(0, 500)] } as never }).eq("id", active.id));
    }
    if (action === "CREATE PATH") await newPath(`From: ${active.title}`, m.content.slice(0, 300), active);
    if (action === "MAKE METHOD CANDIDATE") await makeMethod(m.content, false);
    if (action === "MAKE CANONICAL PRINCIPLE") { if (!confirm("Make a canonical principle? This requires your explicit confirmation.")) return; await makeMethod(m.content, true); }
    const acts = Array.isArray(m.actions) ? m.actions : [];
    await must(supabase.from("sandbox_messages").update({ actions: [...acts, { action, note, at: new Date().toISOString() }] as never }).eq("id", m.id));
    refresh();
  }

  async function updateState() {
    const r = await run({ stage: "STATE_UPDATE", caseId, ...(activePathId ? { pathId: activePathId } : {}) });
    if (!r) return;
    const owner = await uid();
    const next = (states.data?.[0]?.version ?? 0) + 1;
    await must(supabase.from("strategic_state_versions").insert({ owner_id: owner, case_id: caseId, version: next, state: r.output as never, reason: "STATE_UPDATE run", ai_run_id: r.runId }));
    toast.success(`Strategic state v${next} saved.`);
    states.refetch();
  }

  async function runCompare(merge: boolean) {
    if (checked.length < 2) { toast.error("Tick at least two paths."); return; }
    const r = await run({ stage: "PATH_COMPARE", caseId, pathIds: checked });
    if (!r) return;
    setCompare(r.output);
    if (merge) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = r.output as any;
      await newPath(o.merged_title || "Merged path", o.merged_thesis || "", undefined, checked, { agreements: o.agreements, conflicts: o.conflicts, unresolved: o.unresolved });
      for (const id of checked) { const p = paths.data?.find((x) => x.id === id); if (p) await setStatus(p, "MERGED"); }
      setChecked([]);
    }
  }

  async function draftClose() {
    if (!active) return;
    const r = await run({ stage: "PATH_CLOSE", caseId, pathId: active.id });
    if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = r.output as any;
    const j = (a: string[]) => (a ?? []).join("\n");
    setCloseDraft({ conclusion: o.conclusion, accepted: j(o.accepted), rejected: j(o.rejected), uncertain: j(o.uncertain), key_evidence: j(o.key_evidence), reopen_if: j(o.reopen_if) });
  }
  async function confirmClose() {
    if (!active || !closeDraft) return;
    if (Object.values(closeDraft).some((v) => !v.trim())) { toast.error("All closure fields are required."); return; }
    await setStatus(active, "CLOSED", { conclusion: closeDraft as never, closed_at: new Date().toISOString() });
    await must(supabase.from("learning_events").insert({ owner_id: active.owner_id, case_id: caseId, event_type: "FINAL_DECISION", context: `Path closed: ${active.title}`, revised_proposition: closeDraft["conclusion"] ?? null, confirmed: true, scope: "CASE" }));
    setCloseDraft(null);
  }

  async function redteam() {
    if (!active) return;
    const r = await run({ stage: "PATH_REDTEAM", caseId, pathId: active.id });
    if (!r) return;
    await must(supabase.from("thought_paths").update({ detail: { ...((active.detail ?? {}) as Record<string, unknown>), redteam: r.output } as never }).eq("id", active.id));
    setTab("redteam");
    refresh();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestState = states.data?.[0]?.state as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rt = (active?.detail as any)?.redteam;

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      {/* LEFT: paths */}
      <div className="space-y-3">
        <AnalysisPanel caseId={caseId} activePathId={activePathId} />
        <div className="seer-panel space-y-2 p-3">
          <div className="seer-label">New path</div>
          <Input placeholder="Path title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Button size="sm" className="w-full" disabled={!newTitle.trim()} onClick={() => { newPath(newTitle.trim()); setNewTitle(""); }}>NEW PATH</Button>
        </div>
        <div className="seer-panel divide-y">
          {paths.data?.length ? paths.data.map((p) => (
            <div key={p.id} className={`flex items-start gap-2 px-3 py-2 ${p.id === activePathId ? "bg-secondary" : ""}`}>
              <input type="checkbox" aria-label={`Select ${p.title}`} className="mt-1" checked={checked.includes(p.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, p.id] : checked.filter((x) => x !== p.id))} />
              <button className="flex-1 text-left" onClick={() => onActive(p.id)}>
                <div className="text-sm">{p.title}</div>
                <div className="mt-0.5 flex items-center gap-1"><StatusTag s={p.status} /><span className="seer-label">v{p.version}{p.parent_ids.length ? " · child" : ""}{p.merged_from.length ? " · merged" : ""}</span></div>
              </button>
            </div>
          )) : <p className="p-3 text-sm text-muted-foreground">No paths yet.</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runCompare(false)}>COMPARE</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runCompare(true)}>MERGE</Button>
        </div>
        {compare && (
          <div className="seer-panel space-y-2 p-3 text-sm">
            <Block label="Agreements"><Bullets items={compare["agreements"]} /></Block>
            <Block label="Conflicts"><Bullets items={compare["conflicts"]} /></Block>
            <Block label="Unresolved"><Bullets items={compare["unresolved"]} /></Block>
            <p>{String(compare["comparison"] ?? "")}</p>
            <Button size="sm" variant="ghost" onClick={() => setCompare(null)}>Dismiss</Button>
          </div>
        )}
      </div>

      {/* CENTRE */}
      <div className="min-w-0 space-y-3">
        {!active ? <p className="text-sm text-muted-foreground">Create or select a thought path.</p> : (
          <>
            <div className="seer-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-medium">{active.title}</h2>
                <Button size="sm" variant="outline" onClick={() => newPath(`Branch of ${active.title}`, active.thesis, active)}>BRANCH</Button>
                {["OPEN", "REOPENED"].includes(active.status) && <Button size="sm" variant="outline" onClick={() => setStatus(active, "PAUSED")}>PAUSE</Button>}
                {active.status === "PAUSED" && <Button size="sm" variant="outline" onClick={() => setStatus(active, "OPEN")}>RESUME</Button>}
                {!["CLOSED", "REJECTED", "MERGED"].includes(active.status) && <Button size="sm" variant="outline" disabled={!!busy} onClick={draftClose}>CLOSE</Button>}
                {!["CLOSED", "REJECTED", "MERGED"].includes(active.status) && <Button size="sm" variant="ghost" onClick={() => { const why = prompt("Why reject this path?"); if (why) setStatus(active, "REJECTED", { conclusion: { rejected_because: why } as never, closed_at: new Date().toISOString() }); }}>REJECT</Button>}
                {["CLOSED", "REJECTED", "MERGED", "PAUSED"].includes(active.status) && <Button size="sm" variant="outline" onClick={() => setStatus(active, "REOPENED", { version: active.version + 1, reopened_at: new Date().toISOString() })}>REOPEN</Button>}
                <Button size="sm" variant="outline" disabled={!!busy} onClick={redteam}>RED TEAM</Button>
              </div>
              <Input className="mt-2" aria-label="Thesis" placeholder="One-sentence thesis" defaultValue={active.thesis} key={active.id + active.thesis} onBlur={(e) => e.target.value !== active.thesis && supabase.from("thought_paths").update({ thesis: e.target.value }).eq("id", active.id).then(refresh)} />
            </div>
            {closeDraft && (
              <div className="seer-panel space-y-2 border-primary p-3">
                <div className="seer-label text-primary">Close path — review and confirm</div>
                {Object.keys(closeDraft).map((k) => (
                  <div key={k}><div className="seer-label">{k.replace("_", " ")}</div><Textarea rows={2} value={closeDraft[k]} onChange={(e) => setCloseDraft({ ...closeDraft, [k]: e.target.value })} /></div>
                ))}
                <div className="flex gap-2"><Button size="sm" onClick={confirmClose}>Confirm closure</Button><Button size="sm" variant="ghost" onClick={() => setCloseDraft(null)}>Cancel</Button></div>
              </div>
            )}
            <div className="space-y-2">
              {msgs.data?.map((m) => (
                <div key={m.id} className={m.role === "owner" ? "ml-8 rounded border bg-secondary p-3" : "p-1"}>
                  <div className="seer-label mb-1">{m.role === "owner" ? `You · ${m.kind}` : "SEER"} · {new Date(m.created_at).toLocaleString("en-GB")}</div>
                  <div className="seer-prose text-sm"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  {m.role === "seer" && (
                    <>
                      {m.basis && <details className="mt-2 rounded border p-2 text-sm"><summary className="seer-label cursor-pointer">Strategic basis</summary><BasisView b={m.basis} /></details>}
                      {m.prior_learning && <details className="mt-1 rounded border p-2 text-sm"><summary className="seer-label cursor-pointer">Prior learning used</summary><PriorView p={m.prior_learning} /></details>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ACTIONS.map((a) => {
                          const done = Array.isArray(m.actions) && m.actions.some((x) => (x as Record<string, unknown>)?.["action"] === a);
                          return <button key={a} onClick={() => act(m, a)} disabled={!!busy} className={`rounded border px-1.5 py-0.5 font-mono text-xs ${done ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>;
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {busy === "PATH_DISCUSS" && <p className="seer-label">SEER is considering…</p>}
            </div>
            <div className="seer-panel sticky bottom-2 space-y-2 p-3">
              <div className="flex flex-wrap gap-1">
                {KINDS.map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded border px-1.5 py-0.5 font-mono text-xs ${kind === k ? "border-primary text-primary" : "text-muted-foreground"}`}>{k}</button>)}
              </div>
              <Textarea rows={3} aria-label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} placeholder="Think out loud. Ctrl/⌘+Enter to send." />
              <Button size="sm" onClick={send} disabled={!msg.trim() || !!busy}>Send</Button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1">
          {(["state", "path", "redteam"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded border py-1 font-mono text-xs ${tab === t ? "border-primary text-primary" : "text-muted-foreground"}`}>{t.toUpperCase()}</button>)}
        </div>
        {tab === "state" && (
          <div className="seer-panel space-y-3 p-3">
            <div className="flex items-center justify-between"><div className="seer-label">Strategic state {states.data?.[0] ? `v${states.data[0].version}` : ""}</div><div className="flex gap-1"><Button size="sm" variant="outline" disabled={!!busy || editing} onClick={() => setEditing(true)}>{latestState ? "Edit" : "Write state"}</Button><Button size="sm" disabled={!!busy || editing} onClick={updateState}>{busy === "STATE_UPDATE" ? "Updating…" : "Update state (AI)"}</Button></div></div>
            {editing && <StateEditor caseId={caseId} current={latestState} version={states.data?.[0]?.version ?? 0} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); states.refetch(); }} />}
            {(states.data?.length ?? 0) >= 2 && (
              <div className="flex items-center gap-1 text-xs">
                Diff
                <select aria-label="From version" className="rounded border bg-background px-1" value={diff?.[0] ?? ""} onChange={(e) => setDiff([Number(e.target.value), diff?.[1] ?? states.data![0]!.version])}><option value="">—</option>{states.data!.map((s) => <option key={s.id} value={s.version}>v{s.version}</option>)}</select>
                →
                <select aria-label="To version" className="rounded border bg-background px-1" value={diff?.[1] ?? ""} onChange={(e) => setDiff([diff?.[0] ?? states.data![1]!.version, Number(e.target.value)])}><option value="">—</option>{states.data!.map((s) => <option key={s.id} value={s.version}>v{s.version}</option>)}</select>
                {diff && <button className="ml-auto text-muted-foreground" onClick={() => setDiff(null)}>clear</button>}
              </div>
            )}
            {editing ? null : diff ? <StateDiff a={states.data?.find((s) => s.version === diff[0])?.state} b={states.data?.find((s) => s.version === diff[1])?.state} /> : latestState ? (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {STATE_LABELS.map(([k, l]) => <Block key={k} label={l}>{Array.isArray(latestState[k]) ? <Bullets items={latestState[k]} /> : <p className="text-sm">{latestState[k] || "—"}</p>}</Block>)}
              </div>
            ) : <p className="text-sm text-muted-foreground">No state yet. Run Update state once the brief and some research exist.</p>}
          </div>
        )}
        {tab === "path" && active && (
          <div className="seer-panel space-y-3 p-3 text-sm">
            <Block label="Lineage"><p>Parents: {active.parent_ids.map((id) => paths.data?.find((p) => p.id === id)?.title ?? id.slice(0, 8)).join(", ") || "—"}</p><p>Merged from: {active.merged_from.map((id) => paths.data?.find((p) => p.id === id)?.title ?? id.slice(0, 8)).join(", ") || "—"}</p></Block>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Block label="Unknowns"><Bullets items={(active.detail as any)?.unknowns} /></Block>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(active.detail as any)?.conflicts && <Block label="Merge conflicts"><Bullets items={(active.detail as any).conflicts} /></Block>}
            {active.conclusion && <Block label="Path conclusion"><pre className="whitespace-pre-wrap font-sans">{Object.entries(active.conclusion as Record<string, string>).map(([k, v]) => `${k.toUpperCase()}\n${v}`).join("\n\n")}</pre></Block>}
            <Block label="Version history">{pv.data?.length ? pv.data.map((v) => <div key={v.id} className="text-xs text-muted-foreground">v{v.version} · {v.reason} · {new Date(v.created_at).toLocaleString("en-GB")}</div>) : <p className="text-muted-foreground">—</p>}</Block>
          </div>
        )}
        {tab === "redteam" && (
          <div className="seer-panel space-y-3 p-3">
            {!rt ? <p className="text-sm text-muted-foreground">Run RED TEAM on the active path.</p> : <RedTeamView r={rt} />}
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RedTeamView({ r }: { r: any }) {
  return (
    <>
      <Block label="Fatal"><div className="text-destructive"><Bullets items={r.fatal} empty="None" /></div></Block>
      <Block label="Material"><Bullets items={r.material} empty="None" /></Block>
      <Block label="Optional"><Bullets items={r.optional} empty="None" /></Block>
      <Block label="Strongest counterargument"><p className="text-sm">{r.strongest_counterargument}</p></Block>
      <Block label="Revised decision sentence"><p className="text-sm">{r.revised_decision_sentence}</p></Block>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BasisView({ b }: { b: any }) {
  return (
    <div className="mt-2 space-y-2">
      <Block label="Evidence used"><Bullets items={b.evidence_used} /></Block>
      <Block label="Assumptions"><Bullets items={b.assumptions} /></Block>
      <Block label="Contradictions"><Bullets items={b.contradictions} /></Block>
      <Block label="Alternative explanation considered"><p>{b.alternative_considered}</p></Block>
      <Block label="Why the current position is preferred"><p>{b.why_preferred}</p></Block>
      <Block label="What could change it"><p>{b.what_could_change}</p></Block>
      <Block label="Confidence wording"><p>{b.confidence_wording}</p></Block>
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PriorView({ p }: { p: any }) {
  const used = Array.isArray(p.used) ? p.used : [];
  return (
    <div className="mt-2 space-y-1">
      {used.length ? used.map((u: Record<string, string>, i: number) => <div key={i}><span className="font-mono text-xs">{String(u["method_id"]).slice(0, 8)}</span> {u["name"]} — <span className="text-muted-foreground">{u["why"]}</span></div>) : <p className="text-muted-foreground">No prior method applied.</p>}
      <p className="text-xs text-muted-foreground">Retrieved for consideration: {(p.retrieved ?? []).map((r: Record<string, string>) => r["name"]).join(", ") || "none"} · model {p.model}</p>
    </div>
  );
}
function StateDiff({ a, b }: { a: unknown; b: unknown }) {
  const A = (a ?? {}) as Record<string, unknown>;
  const B = (b ?? {}) as Record<string, unknown>;
  const changed = STATE_LABELS.filter(([k]) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
  if (!changed.length) return <p className="text-sm text-muted-foreground">No differences.</p>;
  const show = (v: unknown) => (Array.isArray(v) ? v.join(" · ") : String(v ?? "—"));
  return (
    <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm">
      {changed.map(([k, l]) => (
        <div key={k}><div className="seer-label">{l}</div><p className="text-destructive line-through decoration-1">{show(A[k])}</p><p className="text-primary">{show(B[k])}</p></div>
      ))}
    </div>
  );
}
