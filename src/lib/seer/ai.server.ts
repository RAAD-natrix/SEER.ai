import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output } from "ai";
import type { z } from "zod";

const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

// Model chosen server-side; overridable without code change via SEER_MODEL.
export function seerModel() {
  return process.env["SEER_MODEL"] || "openai/gpt-6-astra";
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function runStructured<T extends z.ZodTypeAny>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort?: "low" | "medium" | "high";
}): Promise<{ output: z.infer<T>; model: string; usage: unknown; runId?: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new GatewayError(401, "AI service is not configured.");
  let runId: string | undefined;
  let lastStatus = 200;
  let lastBody = "";
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID_HEADER, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID_HEADER) ?? undefined;
      lastStatus = res.status;
      if (!res.ok) {
        lastBody = await res.clone().text().catch(() => "");
      }
      return res;
    },
  });
  const model = seerModel();
  try {
    const result = streamText({
      model: provider.responses(model),
      system: opts.system,
      prompt: opts.prompt,
      maxRetries: 0,
      output: Output.object({ schema: opts.schema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: opts.effort ?? "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const output = await result.output;
    const usage = await result.usage;
    const response = await result.response;
    return { output: output as z.infer<T>, model: response?.modelId ?? model, usage, runId };
  } catch (e) {
    if (lastStatus >= 400) {
      let msg = lastBody;
      try {
        const j = JSON.parse(lastBody);
        msg = j?.error?.message ?? j?.message ?? lastBody;
      } catch {
        /* keep text */
      }
      if (lastStatus === 402) msg = msg || "AI credits are exhausted for this workspace.";
      if (lastStatus === 429) msg = msg || "AI rate limit reached. Please wait and try again.";
      throw new GatewayError(lastStatus, String(msg).slice(0, 400));
    }
    throw e;
  }
}
