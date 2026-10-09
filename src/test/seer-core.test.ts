import { describe, expect, it } from "vitest";
import { scanContamination } from "@/lib/seer/contamination";
import { computeReadiness, type ReadinessInput } from "@/lib/seer/readiness";
import { SYSTEM_CHARTER, PROMPT_VERSION } from "@/lib/seer/charter";
import { STAGES } from "@/lib/seer/stages.server";
import { TEMPLATES } from "@/lib/seer/templates";
import { deliverableMarkdown } from "@/lib/seer/export";

const base: ReadinessInput = {
  hasQuestion: true, briefFieldsFilled: 10, triageDone: true, evidenceCount: 10, evidenceWithSource: 10,
  supportingCount: 5, contradictingCount: 2, diagnosisPresent: true, hypothesesCount: 3, openContradictions: 0,
  fatalContradiction: false, optionsCount: 3, decisionRequired: true, commercialNotes: 2, operationalNotes: 2,
  risksCount: 3, stakeholdersCount: 3, risksWithOwner: 3, measurementDesigned: true, closedPaths: 1,
  economicsClaimedUnsupported: false, openFatalRedTeam: false, isImplementationOutput: false, isDecisionOutput: true, ownerApproved: true,
};

describe("bounded interdisciplinary strategy", () => {
  it("exports current approval status without mutating approved content or caveats", () => {
    const o = { content: "**Status:** DRAFT FOR OWNER REVIEW — Internal working note; not a pitch.\n\n## NEXT STEP\nNavin", status: "FINAL — OWNER APPROVED", version: 4, approved_at: "2026-10-08T12:00:00Z" };
    const result = deliverableMarkdown(o);
    expect(result).toContain("FINAL — OWNER APPROVED"); expect(result).toContain("Version 4"); expect(result).toContain("Internal working note; not a pitch."); expect(o.content).toContain("DRAFT FOR OWNER REVIEW");
  });
  it("versions the charter and constrains uncertainty and ethical analogies", () => {
    expect(PROMPT_VERSION).toBe("charter-v1.2");
    for (const term of ["Game theory", "Behavioural science", "consumer marketing", "Actuarial", "CROSS-SECTOR", "Kaizen", "Agile", "Six Sigma DMAIC", "NOT ASSESSED", "Never invent probabilities", "never treat customers as enemies"]) expect(SYSTEM_CHARTER).toContain(term);
  });
  it("removes stale approval wording while retaining document limitations", () => {
    const md = deliverableMarkdown({ content: "**Status:** DRAFT — NOT OWNER APPROVED. Internal only.", status: "FINAL — OWNER APPROVED", version: 4, approved_at: null });
    expect(md).not.toContain("NOT OWNER APPROVED");
    expect(md).toContain("Internal only.");
  });
  it("preserves conventional alternatives and falsifiable cross-sector options", () => {
    expect(STAGES.OPTIONS_ANALYSIS.task).toContain("OPTION 0");
    expect(STAGES.OPTIONS_ANALYSIS.task).toContain("smallest disconfirming test");
    expect(STAGES.DIAGNOSIS.task).toContain("Do not recommend action");
    expect(STAGES.OUTCOME_REVIEW.task).toContain("causal attribution");
  });
  it("keeps template keys unique and experiment controls explicit", () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    const pilot = TEMPLATES.find((t) => t.key === "pilot_design")!;
    expect(pilot.structure).toEqual(expect.arrayContaining(["Baseline", "Owner", "Comparison/control", "Failure threshold", "Stop rule", "Revise rule", "Scale rule", "Attribution limits"]));
    TEMPLATES.forEach((t) => { expect(t.acceptance_tests.length).toBeGreaterThan(0); expect(t.exports).toEqual(expect.arrayContaining(["DOCX", "PDF"])); });
  });
});

describe("readiness index", () => {
  it("totals 100 at full completeness", () => {
    expect(computeReadiness(base).index).toBe(100);
    expect(computeReadiness(base).verdict).toBe("Owner approved");
    expect(computeReadiness({ ...base, ownerApproved: false }).verdict).toBe("Ready for human review");
    expect(computeReadiness({ ...base, hasQuestion: false, ownerApproved: false }).verdict).toBe("Draft");
    expect(computeReadiness({ ...base, hasQuestion: false }).checks.find((c) => c.key === "brief")?.state).toBe("PARTLY MET");
  });
  it("applies blocker caps", () => {
    expect(computeReadiness({ ...base, hasQuestion: false }).index).toBeLessThanOrEqual(35);
    expect(computeReadiness({ ...base, openFatalRedTeam: true }).index).toBeLessThanOrEqual(50);
    expect(computeReadiness({ ...base, closedPaths: 0 }).index).toBeLessThanOrEqual(80);
  });
  it("requires owner approval for FINAL", () => {
    expect(computeReadiness({ ...base, ownerApproved: false }).canBeFinal).toBe(false);
  });
  it("blocks material findings even when QA and all other inputs pass", () => {
    const r = computeReadiness({ ...base, openMaterialRedTeam: true });
    expect(r.canBeFinal).toBe(false);
    expect(r.index).toBeLessThanOrEqual(65);
    expect(r.blockers.some((b) => b.label.includes("material"))).toBe(true);
  });
});

describe("contamination scan", () => {
  it("passes a generic method card", () => {
    const r = scanContamination({ name: "Temporal reversal", mechanism: "Ask whether value arrives too late in the relationship." });
    expect(r.blocked).toBe(false);
  });
  it("blocks names, money and percentages", () => {
    const r = scanContamination({ name: "Loyalty fix", mechanism: "For Acme Bank we cut churn by 12% saving RM 4,000,000." });
    expect(r.blocked).toBe(true);
    expect(r.issues.map((i) => i.type)).toEqual(expect.arrayContaining(["percentage", "money"]));
  });
  it("blocks verbatim source passages", () => {
    const src = "the customers consistently abandoned the counter because queue times exceeded their lunch break window";
    const r = scanContamination({ mechanism: src }, src);
    expect(r.issues.some((i) => i.type === "verbatim_passage")).toBe(true);
  });
});
