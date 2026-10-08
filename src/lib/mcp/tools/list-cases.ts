import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_cases",
  title: "List cases",
  description: "List the strategic cases you can see in SEER, newest first.",
  inputSchema: {
    search: z.string().trim().optional().describe("Optional text to match in the case title."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum cases to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("cases")
      .select("id,title,client,stage,status,assignee,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);
    if (search) q = q.ilike("title", `%${search}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const cases = (data ?? []).map((c) => ({
      id: c.id, title: c.title, client: c.client, stage: c.stage, status: c.status,
      owner: c.assignee, updated_at: c.updated_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(cases, null, 2) }], structuredContent: { cases } };
  },
});
