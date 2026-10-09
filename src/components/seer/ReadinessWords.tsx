import type { CheckState } from "@/lib/seer/readiness";

type Rd = {
  verdict?: string;
  checks?: { key: string; label: string; state: CheckState }[];
  blockers?: { label: string }[];
  canBeFinal?: boolean;
} | null | undefined;

/** Readiness expressed as named gaps and a verdict in words — never a score. */
export function readinessVerdict(rd: Rd): string {
  if (!rd) return "Not assessed";
  if (rd.verdict) return rd.verdict;
  if (rd.canBeFinal) return "Owner approved";
  return (rd.blockers?.length ?? 0) > 0 ? "Draft" : "Ready for human review";
}

export function ReadinessWords({ rd, compact = false }: { rd: Rd; compact?: boolean }) {
  if (!rd) return null;
  const gaps = (rd.checks ?? []).filter((c) => c.state !== "MET");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="seer-label">Readiness</div>
        <div className="text-lg font-semibold text-primary">{readinessVerdict(rd)}</div>
        <div className="text-xs text-muted-foreground">Heuristic checks on the saved record — not a probability the strategy is right. Your sign-off decides.</div>
      </div>
      {(rd.blockers?.length ?? 0) > 0 && (
        <div><div className="seer-label text-destructive">Must fix before approval</div>
          <ul className="list-disc pl-5 text-sm">{rd.blockers!.map((b) => <li key={b.label}>{b.label}</li>)}</ul></div>
      )}
      {!compact && rd.checks && (
        <div><div className="seer-label">Checks</div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {rd.checks.map((c) => <li key={c.key} className="flex justify-between gap-2 text-sm"><span>{c.label}</span><span className={c.state === "MET" ? "text-primary" : c.state === "NOT MET" ? "text-destructive" : "text-warning"}>{c.state.toLowerCase()}</span></li>)}
          </ul>
          {gaps.length === 0 && <p className="text-sm text-muted-foreground">No gaps found in the saved record.</p>}
        </div>
      )}
    </div>
  );
}
