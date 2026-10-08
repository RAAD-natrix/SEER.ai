import { describe, expect, it } from "vitest";
import { scanContamination } from "@/lib/seer/contamination";
import { computeReadiness, type ReadinessInput } from "@/lib/seer/readiness";

const base: ReadinessInput = {
  hasQuestion: true, briefFieldsFilled: 10, triageDone: true, evidenceCount: 10, evidenceWithSource: 10,
  supportingCount: 5, contradictingCount: 2, diagnosisPresent: true, hypothesesCount: 3, openContradictions: 0,
  fatalContradiction: false, optionsCount: 3, decisionRequired: true, commercialNotes: 2, operationalNotes: 2,
  risksCount: 3, stakeholdersCount: 3, risksWithOwner: 3, measurementDesigned: true, closedPaths: 1,
  economicsClaimedUnsupported: false, openFatalRedTeam: false, isImplementationOutput: false, isDecisionOutput: true, ownerApproved: true,
};

describe("readiness index", () => {
  it("totals 100 at full completeness", () => {
    expect(computeReadiness(base).index).toBe(100);
  });
  it("applies blocker caps", () => {
    expect(computeReadiness({ ...base, hasQuestion: false }).index).toBeLessThanOrEqual(35);
    expect(computeReadiness({ ...base, openFatalRedTeam: true }).index).toBeLessThanOrEqual(50);
    expect(computeReadiness({ ...base, closedPaths: 0 }).index).toBeLessThanOrEqual(80);
  });
  it("requires owner approval for FINAL", () => {
    expect(computeReadiness({ ...base, ownerApproved: false }).canBeFinal).toBe(false);
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
