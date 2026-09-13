import { createHash } from "node:crypto";

/** Spec §47 copy for an ambiguous external write. */
export const UNCERTAIN_WRITE_COPY = "LOTS is checking whether this action completed.";
export const UNCERTAIN_WRITE_HINT = "Do not retry it manually yet.";

const PACK_WRITE_TOOLS = new Set([
  "gmail_send",
  "calendar_createEvent",
  "calendar_updateEvent",
  "calendar_deleteEvent",
  "github_createIssue",
  "github_commentIssue",
  "github_commentPull",
  "github_mergePull",
]);

export function normalizePackToolId(tool: string): string {
  return tool.trim().replaceAll(".", "_");
}

export function isPackExternalWrite(tool: string): boolean {
  return PACK_WRITE_TOOLS.has(normalizePackToolId(tool));
}

function invalidJsonValue(): never {
  throw new TypeError("Idempotency payload must contain only JSON values");
}

/** Canonical JSON so key order does not change the hash (spec §19). */
export function stableJsonValue(value: unknown): string {
  const ancestors = new WeakSet<object>();

  function serialize(current: unknown): string {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      return Number.isFinite(current) ? JSON.stringify(current) : invalidJsonValue();
    }
    if (typeof current !== "object") return invalidJsonValue();
    if (ancestors.has(current)) return invalidJsonValue();

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const items: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          if (!(index in current)) return invalidJsonValue();
          items.push(serialize(current[index]));
        }
        return `[${items.join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) return invalidJsonValue();
      const object = current as Record<string, unknown>;
      const entries = Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(object[key])}`);
      return `{${entries.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  }

  return serialize(value);
}

export function packWriteDestination(tool: string, payload: Record<string, unknown>): string {
  const id = normalizePackToolId(tool);
  if (id.startsWith("gmail_")) return String(payload.to ?? "gmail");
  if (id.startsWith("calendar_")) {
    return String(payload.calendarId ?? payload.eventId ?? "primary");
  }
  if (id.startsWith("github_")) return String(payload.repo ?? "github");
  return "unknown";
}

/**
 * Spec §19 key: organization + agent + run + tool + destination + payload hash.
 * Only computed for protected pack writes; other tools return undefined.
 */
export function lotsEffectIdempotencyKey(input: {
  organization: string;
  agent: string;
  run: string;
  tool: string;
  payload: Record<string, unknown>;
}): string | undefined {
  if (!isPackExternalWrite(input.tool)) return undefined;
  const tool = normalizePackToolId(input.tool);
  const destination = packWriteDestination(tool, input.payload);
  const digest = createHash("sha256").update(stableJsonValue(input.payload)).digest("hex");
  return ["lots", input.organization, input.agent, input.run, tool, destination, digest].join(":");
}
