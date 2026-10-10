/** A save that failed in the database. Thrown so the caller never reports success. */
export class SeerWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeerWriteError";
  }
}

export function friendlyWriteError(raw: string | undefined | null): string {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("row-level security") || m.includes("permission denied")) return "You don't have permission to change this record.";
  if (m.includes("immutable") || m.includes("cannot be changed")) return raw ?? "This record is locked and cannot be changed.";
  if (m.includes("duplicate key")) return "This item already exists.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Connection lost — your change was not saved. Please retry.";
  return raw ? `Not saved: ${raw}` : "Not saved. Please retry.";
}

/**
 * Await a database write and throw a SeerWriteError if it failed, so the code
 * after it (success toasts, refetches) never runs on a failed save.
 */
export async function must<T extends { error: { message: string } | null }>(op: PromiseLike<T>): Promise<T> {
  const res = await op;
  if (res.error) throw new SeerWriteError(friendlyWriteError(res.error.message));
  return res;
}
