// Display-only interpretation of AI run rows. Never writes to the database.
// A stage run executes inside one server request, which the hosting platform ends long before
// this threshold, so a row still RUNNING after it cannot still be working.
export const STALE_RUN_MINUTES = 15;
export const STALE_LABEL = "INTERRUPTED / STALE — NEEDS REVIEW";

export function isStaleRun(status: string, startedAt: string, now: number = Date.now()) {
  if (status !== "RUNNING") return false;
  const t = Date.parse(startedAt);
  return Number.isFinite(t) && now - t > STALE_RUN_MINUTES * 60_000;
}

/** Label to show for a run; the stored status is left untouched. */
export function runDisplayStatus(status: string, startedAt: string, now: number = Date.now()) {
  return isStaleRun(status, startedAt, now) ? STALE_LABEL : status;
}
