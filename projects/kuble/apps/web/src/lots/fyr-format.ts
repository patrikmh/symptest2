import type { FyrRunStatus } from "@rakazo/contracts";

export function formatFyrWhen(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function fyrRunLabel(status: FyrRunStatus): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "WAITING_APPROVAL":
      return "Needs you";
    case "SUCCEEDED":
      return "Done";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}
