// Server-only: Ask SEER chat handler. Never import from client code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { seerModel } from "./ai.server";
import { SYSTEM_CHARTER } from "./charter";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

const clip = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("Authorization", `Bearer ${token}`);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ASK_INSTRUCTIONS = `You are in ASK mode: the owner is questioning you about one case.
Answer only from the case record supplied below and clearly labelled general reasoning. Never import facts from other cases.
Distinguish evidence, interpretation, assumption and recommendation in your answers. If the case record does not contain the answer, say so plainly and name what is missing.
Challenge the owner when the evidence or logic warrants it; do not optimise for agreement.
Keep answers concise and commercially experienced. Use British or Malaysian English.`;

async function buildCaseContext(sb: SupabaseClient<Database>, caseId: string) {
  const [c, brief, state, paths, ev, opts, risks, stk, outputs, sources] = await Promise.all([
    sb.from("cases").select("id,title,client,engagement_mode,stage,status,fields").eq("id", caseId).single(),
    sb.from("brief_versions").select("version,raw_brief,fields,answers,triage").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
    sb.from("strategic_state_versions").select("version,state").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
    sb.from("thought_paths").select("id,title,thesis,status,conclusion,detail").eq("case_id", caseId),
    sb.from("evidence_items").select("statement,classification,direction,strength,reliability,source_label,limitation").eq("case_id", caseId).limit(80),
    sb.from("options").select("label,description,scores,hard_constraint_fail,assumptions").eq("case_id", caseId),
    sb.from("risks").select("risk,likelihood,consequence,control,risk_owner,severity").eq("case_id", caseId),
    sb.from("stakeholders").select("name,influence,alignment,resistance").eq("case_id", caseId),
    sb.from("outputs").select("title,template_key,status,version").eq("case_id", caseId),
    sb.from("sources").select("id,title,source_type,classification,processing_consent,extracted_text").eq("case_id", caseId).is("deleted_at", null),
  ]);
  if (c.error || !c.data) throw new Error("CASE_NOT_FOUND");
  // Privacy firewall: local-only sources contribute metadata only, never their text.
  const srcs = (sources.data ?? []).map((s) => ({
    title: s.title,
    type: s.source_type,
    classification: s.classification,
    privacy: s.processing_consent === "ALLOWED_AI" ? "AI processing allowed" : "LOCAL ONLY — content withheld from AI",
    text: s.processing_consent === "ALLOWED_AI" ? clip(s.extracted_text, 8000) : undefined,
  }));
  return {
    case: c.data,
    latest_brief: brief.data,
    strategic_state: state.data?.state ?? null,
    thought_paths: paths.data ?? [],
    evidence: ev.data ?? [],
    options: opts.data ?? [],
    risks: risks.data ?? [],
    stakeholders: stk.data ?? [],
    deliverables: outputs.data ?? [],
    sources: srcs,
  };
}

export async function handleAskSeerChat(request: Request): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonError(401, "Sign in to use Ask SEER.");
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return jsonError(401, "AI service is not configured.");

  const sb = userClient(token);
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData.user) return jsonError(401, "Sign in to use Ask SEER.");
  const uid = userData.user.id;

  let body: { messages?: UIMessage[]; threadId?: string; caseId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request body.");
  }
  const messages = body.messages ?? [];
  const threadId = body.threadId ?? "";
  const caseId = body.caseId ?? "";
  if (!messages.length || !threadId || !caseId) return jsonError(400, "Missing messages, thread or case.");

  // Authorisation: the thread must belong to this user and this case; RLS scopes the case read.
  const { data: thread } = await sb
    .from("case_chat_threads")
    .select("id,case_id,owner_id")
    .eq("id", threadId)
    .eq("owner_id", uid)
    .eq("case_id", caseId)
    .maybeSingle();
  if (!thread) return jsonError(403, "This conversation does not belong to you.");

  // Rate limit: 20 AI runs per user per minute (shared with stage runs).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await sb.from("ai_runs").select("id", { count: "exact", head: true }).eq("owner_id", uid).gte("started_at", since);
  if ((count ?? 0) >= 20) return jsonError(429, "AI rate limit reached. Please wait a minute and try again.");

  let ctx: unknown;
  try {
    ctx = await buildCaseContext(sb, caseId);
  } catch {
    return jsonError(404, "Case not found or not accessible.");
  }

  // Persist the new user message (deduped by its AI SDK id).
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const { data: existing } = await sb
      .from("case_chat_messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("sdk_id", lastUser.id)
      .maybeSingle();
    if (!existing) {
      const { error: insErr } = await sb.from("case_chat_messages").insert({
        thread_id: threadId,
        owner_id: uid,
        role: "user",
        sdk_id: lastUser.id,
        parts: lastUser.parts as never,
      });
      if (insErr) return jsonError(500, "Your message could not be saved. Please retry.");
      // Title the thread from its first user message.
      const firstText = lastUser.parts.find((p) => p.type === "text");
      if (firstText && "text" in firstText) {
        await sb.from("case_chat_threads").update({ title: clip(firstText.text, 60) || "New conversation", updated_at: new Date().toISOString() }).eq("id", threadId);
      }
    }
  }

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch {
    return jsonError(400, "Conversation history could not be read.");
  }

  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID_HEADER, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID_HEADER) ?? undefined;
      return res;
    },
  });

  const result = streamText({
    model: provider.responses(seerModel()),
    system: `${SYSTEM_CHARTER}\n\n${ASK_INSTRUCTIONS}`,
    messages: [
      ...modelMessages.slice(0, -1),
      // Case record travels with the latest turn so history stays compact.
      ...modelMessages.slice(-1).map((m) => ({
        ...m,
        content: [
          { type: "text" as const, text: `<untrusted_data name="case_record">\n${JSON.stringify(ctx).slice(0, 90000)}\n</untrusted_data>` },
          ...(Array.isArray(m.content) ? m.content : [{ type: "text" as const, text: String(m.content) }]),
        ],
      })),
    ],
    abortSignal: request.signal,
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    headers: runId ? { [RUN_ID_HEADER]: runId } : undefined,
    onFinish: async ({ responseMessage }) => {
      const { error } = await sb.from("case_chat_messages").insert({
        thread_id: threadId,
        owner_id: uid,
        role: "assistant",
        sdk_id: responseMessage.id,
        parts: responseMessage.parts as never,
      });
      if (error) console.error("Ask SEER: assistant message could not be saved", error.message);
      await sb.from("case_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    },
  });
}
