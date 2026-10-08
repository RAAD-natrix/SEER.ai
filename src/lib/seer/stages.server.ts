import { z } from "zod";

const S = z.array(z.string());
const str = z.string();

const basis = z.object({
  evidence_used: S,
  assumptions: S,
  contradictions: S,
  alternative_considered: str,
  why_preferred: str,
  what_could_change: str,
  confidence_wording: str,
});
const priorUsed = z.array(z.object({ method_id: str, name: str, why: str }));
const methodCard = z.object({
  name: str,
  problem_type: str,
  mechanism: str,
  why_useful: str,
  prerequisites: str,
  use_when: str,
  do_not_use_when: str,
  counterexamples: str,
  required_evidence: str,
  falsifier: str,
});
const redteam = z.object({
  fatal: S,
  material: S,
  optional: S,
  strongest_counterargument: str,
  revised_decision_sentence: str,
});
const stateSchema = z.object({
  mandate: str, question_to_answer: str, brief_as_presented: str, mandatory_requirements: S,
  stated_problem: str, current_reframe: str, symptoms: S, possible_causes: S, consequences: S,
  constraints: S, strong_and_protect: S, verified_facts: S, reported_information: S,
  direct_observations: S, inferences: S, deductions: S, contradictions: S, assumptions: S,
  unknowns: S, active_hypotheses: S, strongest_alternative_hypothesis: str, stakeholder_tensions: S,
  options: S, risks: S, emerging_judgement: str, what_would_disprove_it: S,
  now: S, next: S, not_yet: S, decision_required: str, confidence_wording: str,
});

export const STAGES = {
  BRIEF_TRIAGE: {
    schema: z.object({
      brief_as_written: str, mandatory_requirements: S, apparent_decision: str, what_is_known: S,
      asserted_not_established: S, missing_information: S, contradictions_or_ambiguities: S,
      critical_questions: S, useful_questions: S, should_not_be_assumed: S, likely_strategic_depth: str,
      provisional_output_types: S,
    }),
    task: "Run BRIEF TRIAGE on the brief. You must NEVER solve the strategy. Only clarify what is asked, known, asserted, missing and what must be asked. Critical questions are those SEER needs answered; useful questions are optional. provisional_output_types should name output families such as Strategic Clarity Record, Strategic Judgement Note or Strategic Decision Paper.",
  },
  THINK_STUDY: {
    schema: z.object({
      what_source_is_doing: str, reasoning_moves: S, argument_evolution: str, evidence_use: str,
      contradiction_handling: str, alternative_creation: str, operational_consequences: str,
      abstract_to_mechanism: str, commercial_reality_testing: str, implementation_link: str,
      simplification_for_audience: str, case_specific_do_not_transfer: S, what_this_does_not_prove: S,
      candidate_methods: z.array(methodCard), source_entities: S,
    }),
    task: "Study this past work to learn HOW the owner thinks, not WHAT the case was about. Produce the private review. Candidate methods must be fully DECONTEXTUALISED: no names, brands, organisations, people, dates, places, figures, prices, percentages, product or campaign names, or distinctive quoted phrases. Describe only generic strategic logic. List every case-specific named entity you notice in source_entities so the firewall can block leakage. Respect the classification: STYLE ONLY or TEMPLATE STRUCTURE ONLY sources should yield style/structure observations rather than reasoning methods.",
  },
  CONTAMINATION_SCAN: {
    schema: z.object({ leak_found: z.boolean(), issues: S }),
    task: "Inspect the candidate method card for likely leakage of client-specific content: proper names, organisations, brands, contact details, specific dates, monetary values, percentages, project/campaign/product names, distinctive verbatim phrases, rare named entities or raw source passages. Be strict. Return issues as short descriptions.",
  },
  OPEN_MIND_STUDY: {
    schema: z.object({
      summary: str,
      items: z.array(z.object({ kind: z.enum(["EXTERNAL FACT OR SOURCE","OWNER THOUGHT","SEER HYPOTHESIS","ANALOGY","METHOD CANDIDATE","QUESTION","COUNTEREXAMPLE"]), text: str })),
      reply: str,
    }),
    task: "Explore this Open Mind material. Separate external facts/sources, owner thoughts, your own hypotheses, analogies, possible method candidates, questions and counterexamples. External research is not automatically a personal method. Note where claims repeat a single origin. reply is your conversational response to the owner.",
  },
  RESEARCH_DELTA: {
    schema: z.object({
      key_claims: S, can_establish: S, cannot_establish: S, reliability_notes: str,
      genuinely_new: S, supports_current_path: S, contradicts_current_path: S, less_certain: S,
      more_certain: S, new_hypothesis: str, weakened_assumption: S, mere_repetition: S,
      new_question: S, justifies_new_path: z.boolean(), suggested_path_title: str, suggested_path_thesis: str,
      evidence: z.array(z.object({
        statement: str,
        classification: z.enum(["BRIEF FACT","VERIFIED","REPORTED","OBSERVED","INFERRED","DEDUCED","CONTRADICTED","UNKNOWN"]),
        direction: z.enum(["SUPPORTS","CONTRADICTS","NEUTRAL"]),
        strength: z.number(), reliability: z.number(), independence: z.number(), limitation: str,
      })),
    }),
    task: "Analyse this new research for the live case and produce a RESEARCH DELTA against the current state and paths. Do not count duplicated or derivative material as independent confirmation. Management representation stays REPORTED unless corroborated. A public self-description cannot prove commercial performance. Extract evidence items: strength 1-5, reliability 0.20-0.95, independence 0.25-1.00.",
  },
  PATH_DISCUSS: {
    schema: z.object({ reply: str, challenges: S, basis, prior_learning_used: priorUsed }),
    task: "Respond to the owner's latest entry on this thought path. Do not optimise for agreement. When warranted say plainly things like: the brief may be solving the wrong problem; the evidence does not support that; this is a slogan, not a mechanism; this looks like an effect treated as a cause; this alternative has not been fairly tested; this is too early to decide. Challenge must be reasoned and proportionate. Provide the inspectable strategic basis (not hidden reasoning). List prior methods used by their ID only if their use_when conditions genuinely fit.",
  },
  PATH_REDTEAM: {
    schema: redteam,
    task: "RED TEAM this thought path as a sceptical CEO, board director, CMO, CFO, operating leader and an affected customer/stakeholder. Test whether the problem is established, whether conclusions outrun evidence, suppressed alternatives, incentives, unverified capabilities, activity-vs-strategy measures, proportionality, the strongest counterargument, the smallest evidence that could reverse it and hidden implementation burden.",
  },
  PATH_COMPARE: {
    schema: z.object({ agreements: S, conflicts: S, unresolved: S, comparison: str, merged_title: str, merged_thesis: str }),
    task: "Compare the selected thought paths. Identify where they agree, where they conflict and what is unresolved. Propose a merged title and thesis only if a coherent merge exists; otherwise explain in comparison why not.",
  },
  PATH_CLOSE: {
    schema: z.object({ conclusion: str, accepted: S, rejected: S, uncertain: S, key_evidence: S, reopen_if: S }),
    task: "Draft a path closure for owner review: final conclusion, what was accepted, rejected, what remains uncertain, which evidence mattered most and what would reopen the path. Use only what the path record supports.",
  },
  STATE_UPDATE: {
    schema: stateSchema,
    task: "Produce the updated overall STRATEGIC STATE for this case from all case records. Keep the stated problem distinct from the reframe. Keep verified facts, reported information, observations, inferences and deductions strictly separate. Unknowns are acceptable. Do not invent facts. Use empty arrays where nothing is established.",
  },
  DIAGNOSIS: {
    schema: z.object({
      stated_problem: str, symptoms: S, causes: S, consequences: S, constraints: S,
      hypotheses: z.array(z.object({ hypothesis: str, supporting: S, contradicting: S })),
      strongest_diagnosis: str, strongest_competitor: str, protect: S, unknowns: S, falsifiers: S, reframe: str,
    }),
    task: "Run the diagnostic method: preserve the stated problem; separate symptom, cause, consequence and constraint; generate no more than three serious hypotheses; test supporting and contradicting evidence; identify the strongest diagnosis and retain the strongest competitor; state what to protect, material unknowns, falsifiers and one concise reframe. Do not recommend action.",
  },
  OPTIONS_ANALYSIS: {
    schema: z.object({
      options: z.array(z.object({ label: str, description: str, assumptions: str, switching_conditions: str, hard_constraint_fail: z.boolean() })),
      note: str,
    }),
    task: "Where a real decision exists, propose options: OPTION 0 maintain current course, OPTION 1 limited correction, OPTION 2 structural intervention, OPTION 3 only if another credible route genuinely exists. No false binaries. Do not score them; the owner scores.",
  },
  RISK_STAKEHOLDER: {
    schema: z.object({
      risks: z.array(z.object({ risk: str, likelihood: str, consequence: str, control: str, risk_owner: str, trigger_condition: str, severity: z.enum(["FATAL","MATERIAL","OPTIONAL"]) })),
      stakeholders: z.array(z.object({ name: str, influence: str, alignment: str, gain: str, loss: str, likely_response: str, resistance: str, info_gap: str, required_response: str })),
    }),
    task: "Identify material risks and stakeholder positions from the case record. Name stakeholders by role, not invented individuals. Leave risk_owner empty if unknown.",
  },
  OUTPUT_SELECT: {
    schema: z.object({ recommended_keys: S, rationale: str }),
    task: "Recommend which output templates fit the case's current maturity and decision. Use template keys from the registry provided. The owner chooses.",
  },
  OUTPUT_DRAFT: {
    schema: z.object({ markdown: str, not_assessed: S }),
    task: "Draft the selected deliverable in Markdown following the template structure exactly. Use only facts in the case record. Where data is missing, write NOT ASSESSED and list it. Never invent figures. Label status as DRAFT — NOT OWNER APPROVED.",
  },
  OUTPUT_REDTEAM: { schema: redteam, task: "RED TEAM this deliverable as a sceptical CEO, board director, CMO, CFO, operating leader and affected stakeholder. Do not hide fatal or material findings." },
  OUTPUT_QA: {
    schema: z.object({ checks: z.array(z.object({ test: str, pass: z.boolean(), note: str })), duplication_found: z.boolean(), summary: str }),
    task: "Quality-gate this deliverable. Check: question/decision is clear; material claims are supported; uncertainty is not concealed; credible alternatives present where required; material risk not ignored; implementation ownership present where required; next action clear; modules do not substantially duplicate; template acceptance tests.",
  },
  LEARNING_EXTRACT: {
    schema: z.object({
      event_type: z.enum(["CORRECTION","REJECTION","REFINEMENT","ASSUMPTION_CHANGE","NEW_EVIDENCE","PRIORITY_CHANGE","STYLE_CORRECTION","METHOD_CANDIDATE","EXCEPTION","FINAL_DECISION","OUTCOME_LEARNING","SYSTEM_FAILURE"]),
      revised_proposition: str, reason: str, has_method: z.boolean(), candidate_method: methodCard,
    }),
    task: "The owner responded to a SEER proposition. Classify the learning event and state the revised proposition and reason. If a generic, transferable method is implied, set has_method true and draft a fully decontextualised method card (no case facts at all). Never infer a universal preference from one case.",
  },
  OUTCOME_REVIEW: {
    schema: z.object({ learning_summary: str, method_implications: S, calibration_notes: S }),
    task: "Compare the registered forecast with the recorded outcome. Note attribution limits. State what this may strengthen, weaken or contradict about methods used. One outcome does not create a universal rule.",
  },
  SYSTEM_DIAGNOSIS: {
    schema: z.object({ reachable: z.boolean(), note: str }),
    task: "Health check. Reply reachable true and a one-line note.",
  },
} as const;

export type StageName = keyof typeof STAGES;
export const STAGE_NAMES = Object.keys(STAGES) as StageName[];

export function tokens(t: string) {
  return new Set(
    t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
  );
}
