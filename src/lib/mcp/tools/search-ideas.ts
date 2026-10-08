import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_ideas",
  title: "Search OPEN MIND",
  description: "Search your OPEN MIND ideas, notes and links by keyword.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).describe("Keyword to match in title or content."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum items (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const safe = query.replace(/[%,()]/g, " ");
    const { data, error } = await supabaseForUser(ctx)
      .from("openmind_items")
      .select("id,kind,title,content,url,case_id,created_at")
      .or(`title.ilike.%${safe}%,content.ilike.%${safe}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const items = (data ?? []).map((i) => ({ id: i.id, kind: i.kind, title: i.title, content: i.content, url: i.url, case_id: i.case_id, created_at: i.created_at }));
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }], structuredContent: { items } };
  },
});
