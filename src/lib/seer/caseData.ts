import { supabase } from "@/integrations/supabase/client";
import { computeReadiness } from "./readiness";
import { templateByKey } from "./templates";

export async function loadCaseBundle(caseId: string) {
  const [c, brief, paths, ev, opts, risks, stk, state, outputs] = await Promise.all([
    supabase.from("cases").select("*").eq("id", caseId).single(),
    supabase.from("brief_versions").select("*").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("thought_paths").select("*").eq("case_id", caseId),
    supabase.from("evidence_items").select("*").eq("case_id", caseId),
    supabase.from("options").select("*").eq("case_id", caseId),
    supabase.from("risks").select("*").eq("case_id", caseId),
    supabase.from("stakeholders").select("*").eq("case_id", caseId),
    supabase.from("strategic_state_versions").select("*").eq("case_id", caseId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("outputs").select("*").eq("case_id", caseId),
  ]);
  return { case: c.data, brief: brief.data, paths: paths.data ?? [], evidence: ev.data ?? [], options: opts.data ?? [], risks: risks.data ?? [], stakeholders: stk.data ?? [], state: state.data, outputs: outputs.data ?? [] };
}
export type CaseBundle = Awaited<ReturnType<typeof loadCaseBundle>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const len = (v: any) => (Array.isArray(v) ? v.filter(Boolean).length : 0);

export function readinessFor(b: CaseBundle, templateKey: string, redteam?: { fatal?: string[]; material?: string[] } | null, approved = false) {
  const t = templateByKey(templateKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = (b.case?.fields ?? {}) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (b.state?.state ?? {}) as any;
  const filled = ["primary_audience","decision","decision_owner","deadline","scope","constraints","exclusions","known_evidence","deliverable","strategic_context"].filter((k) => fields[k]).length;
  return computeReadiness({
    hasQuestion: !!(fields.decision || s.question_to_answer),
    briefFieldsFilled: filled,
    triageDone: !!b.brief?.triage,
    evidenceCount: b.evidence.length,
    evidenceWithSource: b.evidence.filter((e) => e.source_id || e.source_label).length,
    supportingCount: b.evidence.filter((e) => e.direction === "SUPPORTS").length,
    contradictingCount: b.evidence.filter((e) => e.direction === "CONTRADICTS").length,
    diagnosisPresent: !!s.emerging_judgement || b.paths.some((p) => (p.detail as Record<string, unknown>)?.["diagnosis"]),
    hypothesesCount: len(s.active_hypotheses),
    openContradictions: len(s.contradictions),
    fatalContradiction: false,
    optionsCount: b.options.length,
    decisionRequired: t?.kind === "decision",
    commercialNotes: b.paths.reduce((a, p) => a + len((p.detail as Record<string, unknown>)?.["commercial_implications"]), 0) + (s.options ? 1 : 0),
    operationalNotes: b.paths.reduce((a, p) => a + len((p.detail as Record<string, unknown>)?.["operational_implications"]), 0) + len(s.now),
    risksCount: b.risks.length,
    stakeholdersCount: b.stakeholders.length,
    risksWithOwner: b.risks.filter((r) => r.risk_owner).length,
    measurementDesigned: len(s.what_would_disprove_it) > 0,
    closedPaths: b.paths.filter((p) => p.status === "CLOSED").length,
    economicsClaimedUnsupported: false,
    openFatalRedTeam: (redteam?.fatal?.length ?? 0) > 0,
    openMaterialRedTeam: (redteam?.material?.length ?? 0) > 0,
    isImplementationOutput: t?.kind === "implementation",
    isDecisionOutput: t?.kind === "decision",
    ownerApproved: approved,
  });
}
