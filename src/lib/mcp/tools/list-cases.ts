import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_cases",
  title: "List cases",
  description: "List your SEER.ai strategy cases, newest first, with stage and status.",
  inputSchema: {
    query: z.string().trim().max(200).optional().describe("Optional text to match in the case title or client."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum cases to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("cases")
      .select("id,title,client,stage,status,engagement_mode,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (query) {
      const safe = query.replace(/[%,()]/g, " ");
      q = q.or(`title.ilike.%${safe}%,client.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const cases = (data ?? []).map((c) => ({
      id: c.id, title: c.title, client: c.client, stage: c.stage, status: c.status,
      engagement_mode: c.engagement_mode, updated_at: c.updated_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(cases, null, 2) }], structuredContent: { cases } };
  },
});
