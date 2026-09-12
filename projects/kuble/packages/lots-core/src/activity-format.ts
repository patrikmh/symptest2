import { redactSensitive, redactSensitiveText } from "./redact.js";

export const ACTIVITY_KINDS = ["run", "fyr", "approval", "delegation", "tool", "update"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityDetail = {
  agent: string | null;
  tool: string | null;
  provider: string | null;
  runId: string | null;
  externalRef: string | null;
  error: string | null;
};

export type ActivityLine = {
  kind: ActivityKind;
  text: string;
  detail: ActivityDetail;
};

export function formatActivityEvent(input: {
  type: string;
  payload?: unknown;
  botName: string;
  peerName?: string | null;
}): ActivityLine {
  const payload =
    input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
      ? (redactSensitive(input.payload) as Record<string, unknown>)
      : {};
  const peer =
    input.peerName?.trim() ||
    stringField(payload, "name") ||
    stringField(payload, "toBotName") ||
    "a coworker";
  const tool = stringField(payload, "tool") ?? stringField(payload, "kind");
  const task = stringField(payload, "task") ?? stringField(payload, "text");
  const fyr = stringField(payload, "name");
  const error = stringField(payload, "error");
  const bot = input.botName.trim() || "A coworker";

  let kind: ActivityKind = "update";
  let text = `${bot} updated`;
  switch (input.type) {
    case "run.started":
      kind = "run";
      text = fyr ? `${bot} started ${fyr}` : `${bot} started`;
      break;
    case "run.completed":
      kind = "run";
      text = `${bot} finished`;
      break;
    case "run.failed":
      kind = "run";
      text = `${bot} failed`;
      break;
    case "routine.fired":
    case "routine.created":
      kind = "fyr";
      text = fyr ? `${bot} started ${fyr}` : `${bot} started a fyr`;
      break;
    case "thread.ask":
    case "effect.recorded":
      kind = "approval";
      text = `${bot} requested approval`;
      break;
    case "thread.subagent":
    case "group.handoff":
    case "bot.spawned":
      kind = "delegation";
      text = task
        ? `${bot} asked ${peer} to ${task.replace(/\.$/, "")}`
        : `${bot} handed work to ${peer}`;
      break;
    case "agent.tool.called":
      kind = "tool";
      text = tool ? `${bot} used ${humanTool(tool)}` : `${bot} used a tool`;
      break;
    case "effect.reconciled":
      kind = "approval";
      text = `${bot} is checking whether an action completed`;
      break;
    default:
      break;
  }

  return {
    kind,
    text: redactSensitiveText(text),
    detail: {
      agent: bot,
      tool: tool ? humanTool(tool) : null,
      provider: stringField(payload, "provider"),
      runId: stringField(payload, "runId"),
      externalRef: stringField(payload, "externalRef") ?? stringField(payload, "id"),
      error: error ? redactSensitiveText(error) : null,
    },
  };
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanTool(tool: string): string {
  return tool.replaceAll("_", " ").replaceAll(".", " ");
}
