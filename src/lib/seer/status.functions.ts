import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { seerModel } = await import("./ai.server");
    const { PROMPT_VERSION, APP_VERSION } = await import("./charter");
    const sb = context.supabase;
    const t0 = Date.now();
    const ping = await sb.from("profiles").select("id", { count: "exact", head: true });
    const dbLatencyMs = Date.now() - t0;
    const tables = ["cases", "brief_versions", "thought_paths", "evidence_items", "outputs", "method_rules", "ai_runs", "audit_events"] as const;
    const counts: Record<string, number | null> = {};
    await Promise.all(
      tables.map(async (t) => {
        const r = await sb.from(t).select("id", { count: "exact", head: true });
        counts[t] = r.error ? null : r.count ?? 0;
      }),
    );
    return {
      model: seerModel(),
      modelOverridden: !!process.env["SEER_MODEL"],
      aiConfigured: !!process.env["LOVABLE_API_KEY"],
      promptVersion: PROMPT_VERSION,
      appVersion: APP_VERSION,
      db: { ok: !ping.error, latencyMs: dbLatencyMs, error: ping.error?.message ?? null },
      counts,
      checkedAt: new Date().toISOString(),
    };
  });
