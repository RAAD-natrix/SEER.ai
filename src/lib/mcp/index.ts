import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCases from "./tools/list-cases";
import getCase from "./tools/get-case";
import getDeliverable from "./tools/get-deliverable";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "seerai",
  title: "SEERai",
  version: "0.1.0",
  instructions:
    "Read-only access to your SEER strategic cases. Use `list_cases` to find a case, `get_case` for its evidence, risks and deliverables, and `get_deliverable` to read a record's full text.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCases, getCase, getDeliverable],
});
