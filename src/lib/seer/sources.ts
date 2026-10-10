import { SeerWriteError } from "@/lib/seer/must";
import { supabase } from "@/integrations/supabase/client";
import { audit, uid } from "./client";
import { extractFile, sanitiseFilename, sha256, validateFile } from "./extract";

export async function uploadSource(f: File, opts: { area: "think" | "research" | "openmind"; caseId?: string | null; classification?: string; sourceType?: string; title?: string; sourceDate?: string; routing?: string; pathIds?: string[]; consent?: "LOCAL_ONLY" | "ALLOWED_AI" }) {
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
      processing_consent: opts.consent ?? "LOCAL_ONLY",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // duplicate detection by hash
  const { data: dups } = await supabase.from("sources").select("id,title").eq("file_hash", hash).neq("id", data.id).is("deleted_at", null);
  return { source: data, duplicates: dups ?? [] };
}

export async function createTextSource(text: string, opts: { area: "think" | "research" | "openmind"; caseId?: string | null; title: string; classification?: string; routing?: string; pathIds?: string[]; consent?: "LOCAL_ONLY" | "ALLOWED_AI" }) {
  const owner = await uid();
  const enc = new TextEncoder().encode(text);
  const hash = await sha256(enc.buffer as ArrayBuffer);
  const { data, error } = await supabase
    .from("sources")
    .insert({ owner_id: owner, area: opts.area, case_id: opts.caseId ?? null, title: opts.title, source_type: "TEXT", classification: opts.classification ?? null, status: "EXTRACTED", coverage: { total_units: 1, extracted_units: 1, visual_review_required: 0, failed_units: 0, coverage_percent: 100, unit: "text" } as never, file_hash: hash, size_bytes: enc.length, extracted_text: text, routing: opts.routing ?? null, path_ids: opts.pathIds ?? [], processing_consent: opts.consent ?? "LOCAL_ONLY" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type DeleteSourceResult = { ok: true; fileDeleted: boolean; retiredMethods: number } | { ok: false; reason: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Delete a source honestly: the stored file is removed first and confirmed; only then is the
 * record cleared. If the file cannot be removed (e.g. it belongs to another team member, whose
 * files only they can delete), nothing is changed and the reason is returned.
 */
export async function deleteSourceWith(db: { from: (t: string) => any; storage: { from: (b: string) => any } }, id: string): Promise<DeleteSourceResult> {
  const { data: s, error: readErr } = await db.from("sources").select("storage_path,owner_id").eq("id", id).single();
  if (readErr || !s) return { ok: false, reason: "This source could not be found or you cannot access it. Nothing was deleted." };
  let fileDeleted = false;
  if (s.storage_path) {
    const { data: removed, error: rmErr } = await db.storage.from("sources").remove([s.storage_path]);
    if (rmErr) return { ok: false, reason: `The original file could not be deleted (${rmErr.message}). Nothing was changed.` };
    // Storage reports success with an empty list when access rules block the delete.
    if (!Array.isArray(removed) || removed.length === 0)
      return { ok: false, reason: "The original file could not be deleted — only the person who uploaded it can delete its file. Nothing was changed." };
    fileDeleted = true;
  }
  const { error: updErr } = await db.from("sources").update({ deleted_at: new Date().toISOString(), extracted_text: null, storage_path: null, review: null }).eq("id", id);
  if (updErr)
    return { ok: false, reason: fileDeleted ? `The file was deleted, but the source record could not be cleared (${updErr.message}). Please retry.` : `Not deleted: ${updErr.message}` };
  const { data: rules, error: ruleReadErr } = await db.from("method_rules").select("id").contains("source_ids", [id]);
  if (ruleReadErr) return { ok: false, reason: "Source deleted, but methods derived from it could not be checked. Review them in Memory." };
  if (rules?.length) {
    const { error: retErr } = await db.from("method_rules").update({ status: "RETIRED" }).in("id", rules.map((r: { id: string }) => r.id));
    if (retErr) return { ok: false, reason: "Source deleted, but derived methods could not be retired. Review them in Memory." };
  }
  return { ok: true, fileDeleted, retiredMethods: rules?.length ?? 0 };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Deletes and reports the outcome; throws a SeerWriteError-style Error on any failure. */
export async function deleteSource(id: string): Promise<DeleteSourceResult & { ok: true }> {
  const r = await deleteSourceWith(supabase as never, id);
  if (!r.ok) throw new SeerWriteError(r.reason);
  await audit("SOURCE_DELETED", "source", id, { retired_methods: r.retiredMethods, file_deleted: r.fileDeleted });
  return r;
}

export async function signedUrl(path: string) {
  const { data } = await supabase.storage.from("sources").createSignedUrl(path, 60);
  return data?.signedUrl;
}

export async function setSourceConsent(id: string, consent: "LOCAL_ONLY" | "ALLOWED_AI") {
  const { error } = await supabase.from("sources").update({ processing_consent: consent }).eq("id", id);
  if (error) throw new Error(error.message);
}
