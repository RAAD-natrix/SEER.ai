import { describe, expect, it } from "vitest";
import { runSearch, sanitizeQuery, endOfDay, type SearchFilters } from "@/lib/seer/search";
import { must, SeerWriteError, friendlyWriteError } from "@/lib/seer/must";
import { chatRateExceeded } from "@/lib/seer/chat.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Chainable fake PostgREST builder that records calls and serves rows per table.
type Call = { table: string; ops: [string, unknown[]][] };
function fakeDb(tables: Record<string, any[] | "error">) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const b: any = new Proxy({}, {
        get(_t, k: string) {
          if (k === "then") {
            const src = tables[table];
            if (src === "error") return (res: any) => res({ data: null, error: { message: "boom" } });
            let rows = src ?? [];
            const r = call.ops.find(([o]) => o === "range");
            if (r) rows = rows.slice(r[1][0] as number, (r[1][1] as number) + 1);
            const owner = call.ops.find(([o, a]) => o === "eq" && a[0] === "owner_id");
            if (owner) rows = rows.filter((x) => x.owner_id === owner[1][1]);
            return (res: any) => res({ data: rows, error: null });
          }
          return (...args: unknown[]) => { call.ops.push([k, args]); return b; };
        },
      });
      return b;
    },
  };
}
const F = (p: Partial<SearchFilters>): SearchFilters => ({ q: "brand", from: "", to: "", types: [], owner: "", ...p });

describe("search correctness", () => {
  it("reports failed entities instead of claiming nothing was found", async () => {
    const db = fakeDb({ cases: "error", outputs: [{ id: "o1", title: "Brand record", content: "brand", case_id: "c", status: "NOT READY", created_at: "2026-01-01", owner_id: "u" }] });
    const r = await runSearch(db, F({ types: ["CASE", "OUTPUT"] }));
    expect(r.failed).toEqual(["CASE"]);
    expect(r.hits.map((h) => h.id)).toEqual(["o1"]);
  });
  it("pages through every strategic-state version rather than stopping at a fixed cap", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: `s${i}`, case_id: "c", version: i, state: { note: i === 1150 ? "brand reframe" : "x" }, created_at: "2026-01-01", owner_id: "u" }));
    const r = await runSearch(fakeDb({ strategic_state_versions: rows }), F({ types: ["STATE"] }));
    expect(r.hits.map((h) => h.id)).toEqual(["s1150"]);
    expect(r.truncated).toEqual([]);
  });
  it("filters briefs server-side and applies owner + inclusive end date", async () => {
    const db = fakeDb({ brief_versions: [] });
    await runSearch(db, F({ types: ["BRIEF"], owner: "me", from: "2026-01-01", to: "2026-01-31" }));
    const ops = db.calls[0]!.ops;
    expect(ops).toContainEqual(["ilike", ["raw_brief", "%brand%"]]);
    expect(ops).toContainEqual(["eq", ["owner_id", "me"]]);
    expect(ops).toContainEqual(["lte", ["created_at", endOfDay("2026-01-31")]]);
  });
  it("strips PostgREST filter metacharacters", () => {
    expect(sanitizeQuery(" a,b(c)%*d ")).toBe("a b c d");
  });
  it("returns nothing for an empty query without hitting the database", async () => {
    const db = fakeDb({});
    expect((await runSearch(db, F({ q: "  " }))).hits).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe("writes never report success on failure", () => {
  it("must() throws a SeerWriteError on database errors", async () => {
    await expect(must(Promise.resolve({ error: { message: "new row violates row-level security policy" } }))).rejects.toBeInstanceOf(SeerWriteError);
  });
  it("must() passes successful results through", async () => {
    await expect(must(Promise.resolve({ error: null, data: 1 }))).resolves.toEqual({ error: null, data: 1 });
  });
  it("explains locked brief versions plainly", () => {
    expect(friendlyWriteError("Brief versions are immutable: the brief text cannot be changed.")).toMatch(/immutable/);
    expect(friendlyWriteError("permission denied for table x")).toMatch(/permission/);
  });
});

describe("Ask SEER rate limit", () => {
  it("counts chat sends together with stage runs", () => {
    expect(chatRateExceeded(10, 9)).toBe(false);
    expect(chatRateExceeded(10, 10)).toBe(true);
    expect(chatRateExceeded(0, 20)).toBe(true);
    expect(chatRateExceeded(null, null)).toBe(false);
  });
});

import { isStaleRun, runDisplayStatus, STALE_LABEL, STALE_RUN_MINUTES } from "@/lib/seer/runs";
import { deleteSourceWith } from "@/lib/seer/sources";
import { CONSENT_TEXT, consentLabel } from "@/components/seer/ConsentChoice";

describe("stale AI runs (display only)", () => {
  const now = Date.parse("2026-10-10T11:30:00Z");
  it("flags RUNNING rows older than the threshold, never completed or recent ones", () => {
    expect(isStaleRun("RUNNING", "2026-10-10T10:14:00Z", now)).toBe(true);
    expect(isStaleRun("RUNNING", new Date(now - (STALE_RUN_MINUTES - 1) * 60_000).toISOString(), now)).toBe(false);
    expect(isStaleRun("COMPLETED", "2020-01-01T00:00:00Z", now)).toBe(false);
    expect(isStaleRun("RUNNING", "not a date", now)).toBe(false);
  });
  it("labels as interrupted/needs review, not FAILED", () => {
    expect(runDisplayStatus("RUNNING", "2026-10-10T10:36:00Z", now)).toBe(STALE_LABEL);
    expect(STALE_LABEL).not.toMatch(/FAILED/);
    expect(runDisplayStatus("FAILED", "2026-10-10T10:36:00Z", now)).toBe("FAILED");
  });
});

function fakeSourceDb(opts: { removed?: unknown[] | null; rmError?: string; updError?: string; path?: string | null }) {
  const log: string[] = [];
  const q = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, contains: () => b,
      single: async () => ({ data: { storage_path: opts.path === undefined ? "u/think/f.pdf" : opts.path, owner_id: "u" }, error: null }),
      update: () => { log.push(`update:${table}`); return { eq: async () => ({ error: opts.updError ? { message: opts.updError } : null }), in: async () => ({ error: null }) }; },
      then: (res: any) => res({ data: [], error: null }),
    };
    return b;
  };
  return { log, from: q, storage: { from: () => ({ remove: async () => { log.push("remove"); return { data: opts.removed === undefined ? [{ name: "f.pdf" }] : opts.removed, error: opts.rmError ? { message: opts.rmError } : null }; } }) } };
}

describe("source deletion is honest", () => {
  it("does not clear the record when storage refuses (another member's file)", async () => {
    const db = fakeSourceDb({ removed: [] });
    const r = await deleteSourceWith(db, "s1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/only the person who uploaded/);
    expect(db.log).not.toContain("update:sources");
  });
  it("does not clear the record on a storage error", async () => {
    const db = fakeSourceDb({ rmError: "network" });
    expect((await deleteSourceWith(db, "s1")).ok).toBe(false);
    expect(db.log).not.toContain("update:sources");
  });
  it("clears the record only after the file is confirmed deleted", async () => {
    const db = fakeSourceDb({});
    const r = await deleteSourceWith(db, "s1");
    expect(r).toEqual({ ok: true, fileDeleted: true, retiredMethods: 0 });
    expect(db.log).toEqual(["remove", "update:sources"]);
  });
  it("text sources without a file report fileDeleted false", async () => {
    const r = await deleteSourceWith(fakeSourceDb({ path: null }), "s1");
    expect(r).toEqual({ ok: true, fileDeleted: false, retiredMethods: 0 });
  });
  it("reports a record failure after a successful file delete precisely", async () => {
    const r = await deleteSourceWith(fakeSourceDb({ updError: "denied" }), "s1");
    expect(!r.ok && r.reason).toMatch(/file was deleted, but the source record could not be cleared/);
  });
});

describe("privacy wording", () => {
  it("never implies device-only storage and states AI exclusion", () => {
    expect(CONSENT_TEXT.LOCAL_ONLY.label).toMatch(/not sent to AI/);
    expect(CONSENT_TEXT.LOCAL_ONLY.hint).toMatch(/private SEER storage/);
    expect(consentLabel("LOCAL_ONLY")).not.toMatch(/local only/i);
    expect(consentLabel("ALLOWED_AI")).toBe("AI processing allowed");
  });
});

import { gateOpenMindAI, provenanceChain } from "@/lib/seer/openmindPrivacy";

describe("Open Mind privacy gate", () => {
  const typed = { id: "t", parent_id: null, source_id: null };
  const fileItem = { id: "f", parent_id: null, source_id: "s1" };
  const child = { id: "c", parent_id: "f", source_id: null };
  const grandchild = { id: "g", parent_id: "c", source_id: null };
  const all = [typed, fileItem, child, grandchild];
  const allowed = { id: "s1", processing_consent: "ALLOWED_AI", deleted_at: null };
  const local = { id: "s1", processing_consent: "LOCAL_ONLY", deleted_at: null };

  it("blocks exploring a newly uploaded private file", () => {
    const r = gateOpenMindAI([], [], "LOCAL_ONLY");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Saved only/);
  });
  it("allows plain typed text with no file and no parent", () => {
    expect(gateOpenMindAI([], [], undefined)).toEqual({ ok: true });
    expect(gateOpenMindAI(provenanceChain(typed, all), [])).toEqual({ ok: true });
  });
  it("allows an AI-permitted file", () => {
    expect(gateOpenMindAI([], [], "ALLOWED_AI")).toEqual({ ok: true });
    expect(gateOpenMindAI(provenanceChain(fileItem, all), [allowed])).toEqual({ ok: true });
  });
  it("blocks a branch whose ancestor came from a private file", () => {
    const r = gateOpenMindAI(provenanceChain(grandchild, all), [local]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not undone/);
  });
  it("blocks promotion after consent was revoked", () => {
    expect(gateOpenMindAI(provenanceChain(child, all), [local]).ok).toBe(false);
  });
  it("blocks when the source is missing or deleted", () => {
    expect(gateOpenMindAI(provenanceChain(fileItem, all), []).ok).toBe(false);
    expect(gateOpenMindAI(provenanceChain(fileItem, all), [{ ...allowed, deleted_at: "2026-10-10" }]).ok).toBe(false);
  });
  it("blocks broken or cyclic chains", () => {
    expect(provenanceChain({ id: "x", parent_id: "missing", source_id: null }, all)).toBeNull();
    const a = { id: "a", parent_id: "b", source_id: null }, b = { id: "b", parent_id: "a", source_id: null };
    expect(provenanceChain(a, [a, b])).toBeNull();
    expect(gateOpenMindAI(null, []).ok).toBe(false);
  });
});
