import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runSeerStage } from "./stages.functions";

export type StageArgs = {
  stage: string;
  caseId?: string | null;
  pathId?: string | null;
  sourceId?: string | null;
  outputId?: string | null;
  pathIds?: string[];
  text?: string;
  extra?: Record<string, unknown>;
};
export type StageResult = { ok: true; runId: string; model: string; output: Record<string, unknown>; retrieved: { id: string; name: string; status: string }[] };

export function useStage() {
  const fn = useServerFn(runSeerStage);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(args: StageArgs): Promise<StageResult | null> {
    setBusy(args.stage);
    try {
      const r = await fn({ data: args as never });
      if (!r.ok) {
        const pre = r.status === 402 ? "AI credits exhausted. " : r.status === 429 ? "Rate limited. " : "";
        toast.error(`${pre}${r.error}`);
        return null;
      }
      return { ok: true, runId: r.runId, model: r.model, output: JSON.parse(r.outputJson) ?? {}, retrieved: r.retrieved };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI run failed");
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}

export async function audit(event: string, entity?: string, entity_id?: string | null, detail?: Record<string, unknown>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_events").insert({ owner_id: data.user.id, event, entity: entity ?? null, entity_id: entity_id ?? null, detail: (detail ?? null) as never });
}

export async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
