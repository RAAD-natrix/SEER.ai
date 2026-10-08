import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_deliverable",
  title: "Get deliverable",
  description: "Read the full text and status of a Strategic Clarity Record or other deliverable.",
  inputSchema: { output_id: z.string().uuid().describe("The deliverable id from get_case.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ output_id }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("outputs")
      .select("id,case_id,title,status,version,content,approved_at,updated_at")
      .eq("id", output_id).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Deliverable not found.");
    const d = { id: data.id, case_id: data.case_id, title: data.title, status: data.status, version: data.version, approved_at: data.approved_at, updated_at: data.updated_at };
    return {
      content: [{ type: "text", text: `# ${data.title} (v${data.version}, ${data.status})\n\n${data.content}` }],
      structuredContent: { deliverable: { ...d, content: data.content } },
    };
  },
});
