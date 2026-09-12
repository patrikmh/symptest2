import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUSES,
  APPROVAL_TTL_MS,
  approvalStatusFromEffect,
  isStaleIntended,
} from "./approval-status.js";

describe("approvalStatusFromEffect", () => {
  it.each([
    ["intended", "PENDING"],
    ["approved", "APPROVED"],
    ["denied", "REJECTED"],
    ["expired", "EXPIRED"],
    ["executing", "CONSUMED"],
    ["completed", "CONSUMED"],
    ["uncertain", "CONSUMED"],
    ["something-new", "PENDING"],
    [undefined, "PENDING"],
  ] as const)("maps %s to %s", (status, expected) => {
    expect(approvalStatusFromEffect(status)).toBe(expected);
  });

  it("treats a stale intended effect as EXPIRED", () => {
    const createdAt = new Date(Date.now() - APPROVAL_TTL_MS - 1);
    expect(approvalStatusFromEffect("intended", createdAt)).toBe("EXPIRED");
    expect(approvalStatusFromEffect("approved", createdAt)).toBe("APPROVED");
  });

  it("only ever returns a spec §16 status", () => {
    for (const status of ["intended", "denied", "expired", "idle", "x"]) {
      expect(APPROVAL_STATUSES).toContain(approvalStatusFromEffect(status));
    }
  });
});

describe("isStaleIntended", () => {
  it("is false inside the TTL", () => {
    expect(isStaleIntended(new Date(), new Date(), APPROVAL_TTL_MS)).toBe(false);
  });

  it("is true once the TTL has elapsed", () => {
    const createdAt = new Date("2026-09-11T20:00:00.000Z");
    const now = new Date("2026-09-12T20:00:00.000Z");
    expect(isStaleIntended(createdAt, now, APPROVAL_TTL_MS)).toBe(true);
  });
});
