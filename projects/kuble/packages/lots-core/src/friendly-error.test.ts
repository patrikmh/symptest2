import { describe, expect, it } from "vitest";
import { lotsFriendlyError } from "./friendly-error.js";
import { UNCERTAIN_WRITE_COPY, UNCERTAIN_WRITE_HINT } from "./idempotency.js";

describe("lotsFriendlyError", () => {
  it("hides a computer connection refusal behind calm copy", () => {
    expect(lotsFriendlyError(new Error("ECONNREFUSED 172.18.0.3:7091"))).toEqual({
      message: "The coworker computer is unavailable.",
      hint: "Please try again in a moment.",
      technical: "ECONNREFUSED 172.18.0.3:7091",
    });
  });

  it("maps provider failures and UNKNOWN writes", () => {
    expect(lotsFriendlyError("getaddrinfo ENOTFOUND api.openai.com").message).toBe(
      "The model provider is unavailable.",
    );
    expect(lotsFriendlyError("uncertain write")).toEqual({
      message: UNCERTAIN_WRITE_COPY,
      hint: UNCERTAIN_WRITE_HINT,
      technical: "uncertain write",
    });
  });
});
