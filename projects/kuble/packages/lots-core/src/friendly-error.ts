import { UNCERTAIN_WRITE_COPY, UNCERTAIN_WRITE_HINT } from "./idempotency.js";

export type FriendlyError = {
  message: string;
  hint: string | null;
  technical: string | null;
};

function technicalOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Spec §47: simple user-facing copy, with expandable technical details.
 */
export function lotsFriendlyError(error: unknown): FriendlyError {
  const technical = technicalOf(error);
  const lower = technical.toLowerCase();

  if (
    lower.includes("uncertain") ||
    lower.includes("unknown") ||
    lower.includes("ambiguous") ||
    technical.includes(UNCERTAIN_WRITE_COPY)
  ) {
    return { message: UNCERTAIN_WRITE_COPY, hint: UNCERTAIN_WRITE_HINT, technical };
  }

  if (
    /econnrefused|econnreset|7091|supervisor|sandbox|docker|computer/.test(lower) ||
    lower.includes("computer is unavailable")
  ) {
    return {
      message: "The coworker computer is unavailable.",
      hint: "Please try again in a moment.",
      technical,
    };
  }

  if (/enotfound|etimedout|eai_again|provider|model|openai|anthropic|rate limit/.test(lower)) {
    return {
      message: "The model provider is unavailable.",
      hint: "Check the connection in Settings → Models, then try again.",
      technical,
    };
  }

  return {
    message: "Something went wrong.",
    hint: "Please try again in a moment.",
    technical: technical || null,
  };
}
