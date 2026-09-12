/**
 * Fyr run status (spec §13) derived from Rakazo's `Run.status`.
 * Do not add UNKNOWN — that is only for ambiguous external writes.
 */
export const FYR_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "WAITING_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export type FyrRunStatus = (typeof FYR_RUN_STATUSES)[number];

const TABLE: Record<string, FyrRunStatus> = {
  queued: "QUEUED",
  leased: "QUEUED",
  running: "RUNNING",
  waiting_input: "WAITING_APPROVAL",
  waiting_takeover: "WAITING_APPROVAL",
  completed: "SUCCEEDED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

export function fyrarStatusFromRunStatus(runStatus: string | null | undefined): FyrRunStatus {
  if (!runStatus) return "QUEUED";
  return TABLE[runStatus] ?? "QUEUED";
}
