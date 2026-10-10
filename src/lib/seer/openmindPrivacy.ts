// Pure privacy gate for Open Mind AI actions (explore / branch / promote).
// Any item whose own source, or any ancestor's source, is missing, deleted or not
// ALLOWED_AI blocks the AI call — the prompt would otherwise carry that file's
// title, metadata or derived notes. Unlinked typed text is authorised by the explicit action.

export type OmItem = { id: string; parent_id: string | null; source_id: string | null };
export type SourceConsentRow = { id: string; processing_consent: string; deleted_at: string | null };
export type GateResult = { ok: true } | { ok: false; reason: string };

const NOT_UNDONE = " Any AI processing that happened earlier is not undone by this.";

/** Item plus its ancestors (nearest first). Returns null if the chain is broken or cyclic. */
export function provenanceChain(start: OmItem | null, all: OmItem[]): OmItem[] | null {
  const byId = new Map(all.map((i) => [i.id, i]));
  const chain: OmItem[] = [];
  const seen = new Set<string>();
  let cur: OmItem | null = start;
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    chain.push(cur);
    if (!cur.parent_id) break;
    const next = byId.get(cur.parent_id);
    if (!next) return null;
    cur = next;
  }
  return chain;
}

export function sourceIdsOf(chain: OmItem[]): string[] {
  return [...new Set(chain.map((i) => i.source_id).filter((x): x is string => !!x))];
}

/**
 * @param chain  provenance chain whose content would enter the prompt (null = broken chain)
 * @param sources current consent rows fetched under the user's access rules
 * @param newFileConsent consent of a file being uploaded in this same action, if any
 */
export function gateOpenMindAI(chain: OmItem[] | null, sources: SourceConsentRow[], newFileConsent?: string | null): GateResult {
  if (newFileConsent !== undefined && newFileConsent !== null && newFileConsent !== "ALLOWED_AI")
    return { ok: false, reason: "Saved only. This file is private and not sent to AI, so SEER did not explore it. Allow AI processing for the file first if you want SEER to explore it." };
  if (chain === null) return { ok: false, reason: "SEER could not confirm where this item came from, so nothing was sent to AI." };
  const rows = new Map(sources.map((s) => [s.id, s]));
  for (const id of sourceIdsOf(chain)) {
    const s = rows.get(id);
    if (!s) return { ok: false, reason: "This item comes from a file SEER can no longer find or you cannot access, so nothing was sent to AI." };
    if (s.deleted_at) return { ok: false, reason: "This item comes from a deleted file, so nothing was sent to AI." + NOT_UNDONE };
    if (s.processing_consent !== "ALLOWED_AI")
      return { ok: false, reason: "This item comes from a file that is private and not sent to AI, so nothing was sent to AI. Allow AI processing for that file first." + NOT_UNDONE };
  }
  return { ok: true };
}
