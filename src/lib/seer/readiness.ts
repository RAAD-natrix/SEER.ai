// Deterministic READINESS INDEX. Not a probability that the strategy is correct.

export type ReadinessInput = {
  hasQuestion: boolean;
  briefFieldsFilled: number; // 0..10
  triageDone: boolean;
  evidenceCount: number;
  evidenceWithSource: number;
  supportingCount: number;
  contradictingCount: number;
  diagnosisPresent: boolean;
  hypothesesCount: number;
  openContradictions: number;
  fatalContradiction: boolean;
  optionsCount: number;
  decisionRequired: boolean;
  commercialNotes: number;
  operationalNotes: number;
  risksCount: number;
  stakeholdersCount: number;
  risksWithOwner: number;
  measurementDesigned: boolean;
  closedPaths: number;
  economicsClaimedUnsupported: boolean;
  openFatalRedTeam: boolean;
  isImplementationOutput: boolean;
  isDecisionOutput: boolean;
  ownerApproved: boolean;
};

export type Readiness = {
  index: number;
  raw: number;
  components: { key: string; label: string; weight: number; score: number }[];
  blockers: { label: string; cap: number }[];
  canBeFinal: boolean;
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function computeReadiness(i: ReadinessInput): Readiness {
  const comps = [
    { key: "brief", label: "Brief/mandate completeness", weight: 15, f: clamp((i.hasQuestion ? 0.4 : 0) + (i.briefFieldsFilled / 10) * 0.4 + (i.triageDone ? 0.2 : 0)) },
    { key: "evidence", label: "Evidence coverage and provenance", weight: 20, f: i.evidenceCount === 0 ? 0 : clamp(Math.min(i.evidenceCount, 10) / 10 * 0.6 + (i.evidenceWithSource / i.evidenceCount) * 0.4) },
    { key: "diagnosis", label: "Diagnosis maturity", weight: 15, f: clamp((i.diagnosisPresent ? 0.6 : 0) + Math.min(i.hypothesesCount, 3) / 3 * 0.4) },
    { key: "contradiction", label: "Contradiction handling", weight: 10, f: i.contradictingCount === 0 && i.evidenceCount === 0 ? 0 : clamp((i.contradictingCount > 0 ? 0.5 : 0.3) + (i.openContradictions === 0 ? 0.5 : 0.2)) },
    { key: "alternatives", label: "Alternatives/decision logic", weight: 10, f: clamp(Math.min(i.optionsCount, 3) / 3) },
    { key: "feasibility", label: "Commercial/operational feasibility", weight: 10, f: clamp((Math.min(i.commercialNotes, 2) + Math.min(i.operationalNotes, 2)) / 4) },
    { key: "risk", label: "Risk/stakeholder treatment", weight: 10, f: clamp(Math.min(i.risksCount, 3) / 3 * 0.5 + Math.min(i.stakeholdersCount, 3) / 3 * 0.5) },
    { key: "measurement", label: "Measurement/validation design", weight: 5, f: i.measurementDesigned ? 1 : 0 },
    { key: "closure", label: "Path closure/alignment", weight: 5, f: i.closedPaths > 0 ? 1 : 0 },
  ];
  const components = comps.map((c) => ({ key: c.key, label: c.label, weight: c.weight, score: Math.round(c.f * c.weight * 10) / 10 }));
  const raw = Math.round(components.reduce((a, c) => a + c.score, 0));
  const blockers: { label: string; cap: number }[] = [];
  if (!i.hasQuestion) blockers.push({ label: "No clear question/decision", cap: 35 });
  if (i.evidenceCount === 0) blockers.push({ label: "No meaningful evidence", cap: i.isDecisionOutput ? 25 : 40 });
  if (i.fatalContradiction) blockers.push({ label: "Unresolved fatal contradiction", cap: 55 });
  if (i.decisionRequired && i.optionsCount < 2) blockers.push({ label: "No credible alternatives where a decision is required", cap: 60 });
  if (i.isImplementationOutput && i.risksWithOwner === 0) blockers.push({ label: "Implementation output without owners/dependencies", cap: 65 });
  if (i.economicsClaimedUnsupported) blockers.push({ label: "Material economics claimed without support", cap: 50 });
  if (i.openFatalRedTeam) blockers.push({ label: "Open fatal Red Team issue", cap: 50 });
  if (i.closedPaths === 0) blockers.push({ label: "No closed/selected thought path", cap: 80 });
  const cap = blockers.reduce((m, b) => Math.min(m, b.cap), 100);
  const index = Math.min(raw, cap);
  return { index, raw, components, blockers, canBeFinal: i.ownerApproved && blockers.length === 0 };
}
