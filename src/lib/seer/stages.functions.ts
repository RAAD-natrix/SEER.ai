import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  stage: z.string(),
  caseId: z.string().uuid().nullable().optional(),
  pathId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  outputId: z.string().uuid().nullable().optional(),
  pathIds: z.array(z.string().uuid()).optional(),
  text: z.string().max(60000).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const clip = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);

export const runSeerStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { STAGES, tokens } = await import("./stages.server");
    const { runStructured, GatewayError } = await import("./ai.server");
    const { SYSTEM_CHARTER, PROMPT_VERSION } = await import("./charter");
    const { TEMPLATES, templateByKey } = await import("./templates");
    const sb = context.supabase;
    const uid = context.userId;

    if (!(data.stage in STAGES)) throw new Error("Unknown stage");
    const stage = data.stage as keyof typeof STAGES;
    const def = STAGES[stage];

    // Rate limit: 20 AI runs per user per minute
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: limitError } = await sb.from("ai_runs").select("id", { count: "exact", head: true }).eq("owner_id", uid).gte("started_at", since);
    if (limitError) throw new Error("Unable to verify AI usage. Please retry later.");
    if ((count ?? 0) >= 20) return { ok: false as const, error: "Rate limit: too many AI runs in the last minute. Please wait.", status: 429, runId: "", model: "", outputJson: "null", retrieved: [] as { id: string; name: string; status: string }[] };

    const { data: profile } = await sb.from("profiles").select("settings").eq("id", uid).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings: any = profile?.settings ?? {};
    const depth = String(settings.work_depth ?? "STANDARD");

    // ---- Gather case-bounded context (never other cases) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputIds: any = {};
    if (data.caseId) {
      const [c, brief, state, paths, ev, claims, opts, risks, stk] = await Promise.all([
        sb.from("cases").select("*").eq("id", data.caseId).single(),
        sb.from("brief_versions").select("version,raw_brief,fields,answers,triage").eq("case_id", data.caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
        sb.from("strategic_state_versions").select("version,state").eq("case_id", data.caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
        sb.from("thought_paths").select("id,title,thesis,status,conclusion,detail,parent_ids,merged_from").eq("case_id", data.caseId),
        sb.from("evidence_items").select("id,statement,classification,direction,strength,reliability,independence,source_label,limitation,path_ids").eq("case_id", data.caseId).limit(80),
        sb.from("claims").select("id,claim,permitted_wording,falsifier").eq("case_id", data.caseId).limit(40),
        sb.from("options").select("label,description,scores,hard_constraint_fail,assumptions").eq("case_id", data.caseId),
         sb.from("risks").select("risk,likelihood,consequence,control,risk_owner,trigger_condition,severity").eq("case_id", data.caseId),
        sb.from("stakeholders").select("name,influence,alignment,resistance").eq("case_id", data.caseId),
      ]);
      if (c.error || !c.data) throw new Error("Case not found");
      const contextError = [brief, state, paths, ev, claims, opts, risks, stk].find((r) => r.error)?.error;
      if (contextError) throw new Error("Case context could not be loaded completely. Analysis has not started.");
      ctx.case = { title: c.data.title, client: c.data.client, case_owner: c.data.assignee, stage_owners: c.data.stage_owners, engagement_mode: c.data.engagement_mode, fields: c.data.fields, stage: c.data.stage };
      ctx.brief = brief.data;
      ctx.strategic_state = state.data?.state ?? null;
      ctx.paths = paths.data;
      ctx.evidence = ev.data;
      ctx.claims = claims.data;
      ctx.options = opts.data;
      ctx.risks = risks.data;
      ctx.stakeholders = stk.data;
      inputIds.brief_version = brief.data?.version;
      inputIds.state_version = state.data?.version;
      inputIds.evidence_ids = ev.data?.map((e) => e.id);
    }
    if (data.pathId) {
      const [p, msgs] = await Promise.all([
        sb.from("thought_paths").select("*").eq("id", data.pathId).single(),
        sb.from("sandbox_messages").select("role,kind,content,created_at").eq("path_id", data.pathId).order("created_at", { ascending: false }).limit(30),
      ]);
      if (p.error || !p.data) throw new Error("Path not found");
      if (data.caseId && p.data.case_id !== data.caseId) throw new Error("Path does not belong to case");
      ctx.active_path = p.data;
      ctx.conversation = (msgs.data ?? []).reverse();
    }
    if (data.pathIds?.length) {
      const { data: ps } = await sb.from("thought_paths").select("*").in("id", data.pathIds);
      if (data.caseId && ps?.some((p) => p.case_id !== data.caseId)) throw new Error("Paths must belong to this case");
      ctx.selected_paths = ps;
    }
    let sourceText = "";
    if (data.sourceId) {
      const { data: s } = await sb.from("sources").select("*").eq("id", data.sourceId).is("deleted_at", null).single();
      if (!s) throw new Error("Source not found");
      // Firewall: research sources only inside their own case
      if (s.case_id && data.caseId && s.case_id !== data.caseId) throw new Error("Source belongs to a different case");
      sourceText = s.extracted_text ?? "";
      ctx.source = { title: s.title, type: s.source_type, classification: s.classification, coverage: s.coverage, warnings: s.warnings };
      inputIds.source_id = s.id;
    }
    if (data.outputId) {
      const { data: o } = await sb.from("outputs").select("*").eq("id", data.outputId).single();
      if (!o) throw new Error("Output not found");
      ctx.output = { title: o.title, template: templateByKey(o.template_key), content: clip(o.content, 40000) };
      inputIds.output_id = o.id;
    }
    if (stage === "OUTPUT_DRAFT" || stage === "OUTPUT_SELECT") {
      const key = data.extra?.["template_key"] as string | undefined;
      ctx.template = key ? templateByKey(key) : TEMPLATES.map((t) => ({ key: t.key, name: t.name, use_when: t.use_when, do_not_use_when: t.do_not_use_when, kind: t.kind }));
      ctx.readiness = data.extra?.["readiness"] ?? null;
    }

    // ---- Memory retrieval: generic method cards only ----
    let retrieved: { id: string; name: string; status: string }[] = [];
    const usesMemory = ["PATH_DISCUSS", "DIAGNOSIS", "OPTIONS_ANALYSIS", "OUTPUT_DRAFT", "PATH_REDTEAM", "STATE_UPDATE"].includes(stage);
    if (usesMemory && settings.cross_case_retrieval !== false) {
      const statuses = ["CANONICAL", "STARTER"];
      if (settings.candidate_memory !== false) statuses.push("CANDIDATE");
      const { data: rules } = await sb
        .from("method_rules")
        .select("id,name,status,memory_class,problem_type,mechanism,use_when,do_not_use_when,counterexamples,required_evidence,falsifier,tags")
        .in("status", statuses)
        .limit(300);
      const q = tokens(JSON.stringify([ctx.case, ctx.active_path, data.text, ctx.strategic_state?.current_reframe]));
      const scored = (rules ?? []).map((r) => {
        const t = tokens([r.name, r.problem_type, r.mechanism, r.use_when, (r.tags ?? []).join(" ")].join(" "));
        let s = 0;
        t.forEach((w) => q.has(w) && s++);
        if (r.counterexamples) s -= 0.5;
        return { r, s };
      });
      const canon = scored.filter((x) => x.r.status === "CANONICAL").map((x) => x.r);
      const rest = scored.filter((x) => x.r.status !== "CANONICAL" && x.s > 0).sort((a, b) => b.s - a.s).slice(0, depth === "QUICK" ? 3 : depth === "DEEP" ? 8 : 5).map((x) => x.r);
      const style = scored.filter((x) => x.r.memory_class === "STYLE" && x.r.status === "CANONICAL").map((x) => x.r);
      const picked = [...new Map([...canon, ...rest, ...style].map((r) => [r.id, r])).values()];
      ctx.prior_methods = picked.map((r) => ({ id: r.id, name: r.name, status: r.status, class: r.memory_class, mechanism: r.mechanism, use_when: r.use_when, do_not_use_when: r.do_not_use_when, counterexamples: r.counterexamples }));
      retrieved = picked.map((r) => ({ id: r.id, name: r.name, status: r.status }));
    }

    const prompt = [
      `STAGE: ${stage}`,
      `WORK DEPTH: ${depth}`,
      `TASK: ${def.task}`,
      data.extra && stage !== "OUTPUT_DRAFT" ? `OWNER PARAMETERS: ${JSON.stringify(data.extra).slice(0, 4000)}` : "",
      `<untrusted_data name="case_record">\n${JSON.stringify(ctx).slice(0, 90000)}\n</untrusted_data>`,
      sourceText ? `<untrusted_data name="source_text">\n${clip(sourceText, 60000)}\n</untrusted_data>` : "",
      data.text ? `<untrusted_data name="owner_input">\n${data.text}\n</untrusted_data>` : "",
    ].filter(Boolean).join("\n\n");

    const { data: run, error: runErr } = await sb
      .from("ai_runs")
      .insert({
        owner_id: uid, case_id: data.caseId ?? null, path_id: data.pathId ?? null, stage,
        prompt_version: PROMPT_VERSION, status: "RUNNING", input_ids: inputIds as never,
        retrieved_method_ids: retrieved.map((r) => r.id), frozen_state: { state: ctx.strategic_state ?? null, path: ctx.active_path ?? null } as never,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    try {
      const res = await runStructured({ system: SYSTEM_CHARTER, prompt, schema: def.schema, effort: depth === "DEEP" ? "high" : depth === "QUICK" ? "low" : "medium" });
      await sb.from("ai_runs").update({ status: "COMPLETED", model: res.model, output: res.output as never, usage: res.usage as never, completed_at: new Date().toISOString() }).eq("id", run.id);
      return { ok: true as const, runId: run.id, model: res.model, outputJson: JSON.stringify(res.output), retrieved, error: "", status: 200 };
    } catch (e) {
      const status = e instanceof GatewayError ? e.status : 500;
      const msg = e instanceof Error ? e.message : "AI run failed";
      await sb.from("ai_runs").update({ status: "FAILED", error: msg, completed_at: new Date().toISOString() }).eq("id", run.id);
      return { ok: false as const, error: msg, status, runId: run.id, model: "", outputJson: "null", retrieved: [] as { id: string; name: string; status: string }[] };
    }
  });
