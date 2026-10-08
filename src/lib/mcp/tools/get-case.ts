import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_case",
  title: "Get case overview",
  description: "Get one case with its latest brief, brief triage and current strategic state.",
  inputSchema: { case_id: z.string().uuid().describe("The case id from list_cases.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const [c, b, s] = await Promise.all([
      sb.from("cases").select("id,title,client,stage,status,engagement_mode,updated_at").eq("id", case_id).is("deleted_at", null).maybeSingle(),
      sb.from("brief_versions").select("version,raw_brief,triage,created_at").eq("case_id", case_id).order("version", { ascending: false }).limit(1).maybeSingle(),
      sb.from("strategic_state_versions").select("version,state,reason,created_at").eq("case_id", case_id).order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const err = c.error ?? b.error ?? s.error;
    if (err) return { content: [{ type: "text", text: err.message }], isError: true };
    if (!c.data) throw new ToolError("Case not found.");
    const result = {
      case: c.data,
      latest_brief: b.data ? { version: b.data.version, raw_brief: b.data.raw_brief, triage: b.data.triage, created_at: b.data.created_at } : null,
      strategic_state: s.data ? { version: s.data.version, state: s.data.state, reason: s.data.reason, created_at: s.data.created_at } : null,
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  },
});
