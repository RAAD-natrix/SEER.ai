import { supabase } from "@/integrations/supabase/client";
import { audit, uid } from "./client";
import { extractFile, sanitiseFilename, sha256, validateFile } from "./extract";

export async function uploadSource(f: File, opts: { area: "think" | "research" | "openmind"; caseId?: string | null; classification?: string; sourceType?: string; title?: string; sourceDate?: string; routing?: string; pathIds?: string[] }) {
  const owner = await uid();
  const { data: prof } = await supabase.from("profiles").select("settings").eq("id", owner).single();
  const maxMb = Number((prof?.settings as Record<string, unknown> | null)?.["max_upload_mb"] ?? 20);
  const err = validateFile(f, Math.min(maxMb, 25));
  if (err) throw new Error(err);
  const buf = await f.arrayBuffer();
  const hash = await sha256(buf);
  const path = `${owner}/${opts.area}/${crypto.randomUUID()}_${sanitiseFilename(f.name)}`;
  const up = await supabase.storage.from("sources").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const ex = await extractFile(f);
  const { data, error } = await supabase
    .from("sources")
    .insert({
      owner_id: owner,
      area: opts.area,
      case_id: opts.caseId ?? null,
      title: opts.title || f.name,
      filename: sanitiseFilename(f.name),
      mime: f.type || null,
      file_hash: hash,
      size_bytes: f.size,
      source_type: opts.sourceType ?? f.name.split(".").pop()?.toUpperCase() ?? null,
      classification: opts.classification ?? null,
      status: ex.status,
      coverage: ex.coverage as never,
      warnings: ex.warnings,
      storage_path: path,
      extracted_text: ex.text,
      source_date: opts.sourceDate ?? null,
      routing: opts.routing ?? null,
      path_ids: opts.pathIds ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // duplicate detection by hash
  const { data: dups } = await supabase.from("sources").select("id,title").eq("file_hash", hash).neq("id", data.id).is("deleted_at", null);
  return { source: data, duplicates: dups ?? [] };
}

export async function createTextSource(text: string, opts: { area: "think" | "research" | "openmind"; caseId?: string | null; title: string; classification?: string; routing?: string; pathIds?: string[] }) {
  const owner = await uid();
  const enc = new TextEncoder().encode(text);
  const hash = await sha256(enc.buffer as ArrayBuffer);
  const { data, error } = await supabase
    .from("sources")
    .insert({ owner_id: owner, area: opts.area, case_id: opts.caseId ?? null, title: opts.title, source_type: "TEXT", classification: opts.classification ?? null, status: "EXTRACTED", coverage: { total_units: 1, extracted_units: 1, visual_review_required: 0, failed_units: 0, coverage_percent: 100, unit: "text" } as never, file_hash: hash, size_bytes: enc.length, extracted_text: text, routing: opts.routing ?? null, path_ids: opts.pathIds ?? [] })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSource(id: string) {
  const { data: s } = await supabase.from("sources").select("storage_path").eq("id", id).single();
  if (s?.storage_path) await supabase.storage.from("sources").remove([s.storage_path]);
  await supabase.from("sources").update({ deleted_at: new Date().toISOString(), extracted_text: null, storage_path: null, review: null }).eq("id", id);
  // Conservative: retire any method derived from this source so it no longer informs future work.
  const { data: rules } = await supabase.from("method_rules").select("id").contains("source_ids", [id]);
  if (rules?.length) await supabase.from("method_rules").update({ status: "RETIRED" }).in("id", rules.map((r) => r.id));
  await audit("SOURCE_DELETED", "source", id, { retired_methods: rules?.length ?? 0 });
}

export async function signedUrl(path: string) {
  const { data } = await supabase.storage.from("sources").createSignedUrl(path, 60);
  return data?.signedUrl;
}
