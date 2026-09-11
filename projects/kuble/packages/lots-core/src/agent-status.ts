/**
 * LOTS agent status (spec §9) derived from Rakazo's run status.
 *
 * Rakazo exposes a bot's latest run status (`queued | leased | running | waiting_input |
 * waiting_takeover | completed | failed | cancelled`) or `"idle"` when it has never run.
 * LOTS shows four states; the mapping is a pure function so the UI never inspects run
 * statuses directly.
 */
export const AGENT_STATUSES = ["IDLE", "WORKING", "WAITING", "ERROR"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

const WORKING_RUN_STATUSES: ReadonlySet<string> = new Set(["queued", "leased", "running"]);
const WAITING_RUN_STATUSES: ReadonlySet<string> = new Set(["waiting_input", "waiting_takeover"]);

export function agentStatusFromRunStatus(runStatus: string | null | undefined): AgentStatus {
  if (!runStatus) return "IDLE";
  if (WORKING_RUN_STATUSES.has(runStatus)) return "WORKING";
  if (WAITING_RUN_STATUSES.has(runStatus)) return "WAITING";
  if (runStatus === "failed") return "ERROR";
  return "IDLE";
}
