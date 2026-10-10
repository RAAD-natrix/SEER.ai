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
