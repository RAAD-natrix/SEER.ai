// Search engine for the Search page. Pure apart from the injected client so it can be tested.
export type SearchFilters = { q: string; from: string; to: string; types: string[]; owner: string };
export type SearchHit = { type: string; id: string; title: string; snippet: string; date: string; caseId: string | null; status: string; owner: string };
export type SearchResult = { hits: SearchHit[]; failed: string[]; truncated: string[] };
export const SEARCH_TYPES = ["CASE", "BRIEF", "TRIAGE", "SOURCE", "PATH", "STATE", "OUTPUT", "METHOD", "OPEN MIND"];

const PAGE = 500;
const MAX_ROWS = 5000; // per entity; beyond this the result is reported as truncated
const ILIKE_LIMIT = 200;

export function sanitizeQuery(q: string) {
  return q.trim().replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
}
export function snip(t: string, q: string) {
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? t.slice(0, 160) : `…${t.slice(Math.max(0, i - 60), i + 120)}…`;
}
export function endOfDay(d: string) {
  return `${d}T23:59:59.999Z`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };
type Row = Record<string, any>;

export async function runSearch(db: Db, f: SearchFilters): Promise<SearchResult> {
  const q = sanitizeQuery(f.q);
  const out: SearchResult = { hits: [], failed: [], truncated: [] };
  if (!q) return out;
  const lq = q.toLowerCase();
  const like = `%${q}%`;
  const want = (t: string) => !f.types.length || f.types.includes(t);
  const scope = (x: any, dateCol: string) => {
    let y = x;
    if (f.from) y = y.gte(dateCol, f.from);
    if (f.to) y = y.lte(dateCol, endOfDay(f.to));
    if (f.owner) y = y.eq("owner_id", f.owner);
    return y;
  };
  const push = (h: SearchHit) => out.hits.push(h);

  // Server-side text match (one request).
  async function ilike(label: string, build: () => any, map: (r: Row) => void) {
    const { data, error } = await scope(build(), "created_at").order("created_at", { ascending: false }).limit(ILIKE_LIMIT);
    if (error) { out.failed.push(label); return; }
    if ((data?.length ?? 0) >= ILIKE_LIMIT) out.truncated.push(label);
    (data ?? []).forEach(map);
  }
  // JSON columns cannot be text-filtered remotely: page through every visible row.
  async function scan(label: string, build: () => any, map: (r: Row) => void) {
    for (let off = 0; off < MAX_ROWS; off += PAGE) {
      const { data, error } = await scope(build(), "created_at").order("created_at", { ascending: false }).range(off, off + PAGE - 1);
      if (error) { out.failed.push(label); return; }
      (data ?? []).forEach(map);
      if ((data?.length ?? 0) < PAGE) return;
    }
    out.truncated.push(label);
  }

  const jobs: Promise<void>[] = [];
  if (want("CASE")) jobs.push(ilike("CASE", () => db.from("cases").select("id,title,client,stage,created_at,owner_id").is("deleted_at", null).or(`title.ilike.${like},client.ilike.${like}`), (d) => push({ type: "CASE", id: d.id, title: d.title, snippet: d.client ?? "", date: d.created_at, caseId: d.id, status: d.stage, owner: d.owner_id })));
  if (want("BRIEF")) jobs.push(ilike("BRIEF", () => db.from("brief_versions").select("id,case_id,version,raw_brief,created_at,owner_id").ilike("raw_brief", like), (d) => push({ type: "BRIEF", id: d.id, title: `Brief v${d.version}`, snippet: snip(d.raw_brief, q), date: d.created_at, caseId: d.case_id, status: `v${d.version}`, owner: d.owner_id })));
  if (want("TRIAGE")) jobs.push(scan("TRIAGE", () => db.from("brief_versions").select("id,case_id,version,triage,created_at,owner_id").not("triage", "is", null), (d) => { const t = JSON.stringify(d.triage ?? ""); if (t.toLowerCase().includes(lq)) push({ type: "TRIAGE", id: d.id, title: `Initial analysis v${d.version}`, snippet: snip(t, q), date: d.created_at, caseId: d.case_id, status: "TRIAGE", owner: d.owner_id }); }));
  if (want("SOURCE")) jobs.push(ilike("SOURCE", () => db.from("sources").select("id,title,area,case_id,status,created_at,owner_id,extracted_text").is("deleted_at", null).or(`title.ilike.${like},extracted_text.ilike.${like}`), (d) => push({ type: "SOURCE", id: d.id, title: `${d.title} (${d.area})`, snippet: snip(d.extracted_text ?? d.title, q), date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })));
  if (want("PATH")) jobs.push(ilike("PATH", () => db.from("thought_paths").select("id,title,thesis,case_id,status,created_at,owner_id").or(`title.ilike.${like},thesis.ilike.${like}`), (d) => push({ type: "PATH", id: d.id, title: d.title, snippet: d.thesis, date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })));
  if (want("STATE")) jobs.push(scan("STATE", () => db.from("strategic_state_versions").select("id,case_id,version,state,created_at,owner_id"), (d) => { const t = JSON.stringify(d.state ?? ""); if (t.toLowerCase().includes(lq)) push({ type: "STATE", id: d.id, title: `Strategic state v${d.version}`, snippet: snip(t, q), date: d.created_at, caseId: d.case_id, status: `v${d.version}`, owner: d.owner_id }); }));
  if (want("OUTPUT")) jobs.push(ilike("OUTPUT", () => db.from("outputs").select("id,title,content,case_id,status,created_at,owner_id").or(`title.ilike.${like},content.ilike.${like}`), (d) => push({ type: "OUTPUT", id: d.id, title: d.title, snippet: snip(d.content, q), date: d.created_at, caseId: d.case_id, status: d.status, owner: d.owner_id })));
  if (want("METHOD")) jobs.push(ilike("METHOD", () => db.from("method_rules").select("id,name,mechanism,status,created_at,owner_id").or(`name.ilike.${like},mechanism.ilike.${like},use_when.ilike.${like}`), (d) => push({ type: "METHOD", id: d.id, title: d.name, snippet: d.mechanism ?? "", date: d.created_at, caseId: null, status: d.status, owner: d.owner_id })));
  if (want("OPEN MIND")) jobs.push(ilike("OPEN MIND", () => db.from("openmind_items").select("id,title,content,kind,created_at,owner_id").or(`title.ilike.${like},content.ilike.${like}`), (d) => push({ type: "OPEN MIND", id: d.id, title: d.title || d.kind, snippet: snip(d.content, q), date: d.created_at, caseId: null, status: d.kind, owner: d.owner_id })));
  await Promise.all(jobs.map((j) => j.catch(() => undefined)));
  out.hits.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
