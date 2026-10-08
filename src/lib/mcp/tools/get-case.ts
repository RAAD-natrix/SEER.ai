import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_case",
  title: "Get case",
  description: "Get one case's details, its evidence, risks and deliverables.",
  inputSchema: { case_id: z.string().uuid().describe("The case id from list_cases.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_id }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data: c, error } = await sb
      .from("cases")
      .select("id,title,client,stage,status,assignee,engagement_mode,created_at,updated_at")
      .eq("id", case_id).is("deleted_at", null).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!c) throw new ToolError("Case not found.");
    const [ev, rk, out] = await Promise.all([
      sb.from("evidence_items").select("*").eq("case_id", case_id).limit(50),
      sb.from("risks").select("*").eq("case_id", case_id).limit(50),
      sb.from("outputs").select("id,title,status,version,approved_at,updated_at").eq("case_id", case_id),
    ]);
    const result = {
      case: { ...c, owner: c.assignee },
      evidence: JSON.parse(JSON.stringify(ev.data ?? [])),
      risks: JSON.parse(JSON.stringify(rk.data ?? [])),
      deliverables: (out.data ?? []).map((o) => ({ id: o.id, title: o.title, status: o.status, version: o.version, approved_at: o.approved_at, updated_at: o.updated_at })),
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
