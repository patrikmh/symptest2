import { describe, expect, it } from "vitest";
import { FYR_RUN_STATUSES, fyrarStatusFromRunStatus } from "./fyr-status.js";

describe("fyrarStatusFromRunStatus", () => {
  it.each([
    [undefined, "QUEUED"],
    [null, "QUEUED"],
    ["queued", "QUEUED"],
    ["leased", "QUEUED"],
    ["running", "RUNNING"],
    ["waiting_input", "WAITING_APPROVAL"],
    ["waiting_takeover", "WAITING_APPROVAL"],
    ["completed", "SUCCEEDED"],
    ["failed", "FAILED"],
    ["cancelled", "CANCELLED"],
    ["something-new", "QUEUED"],
  ] as const)("maps %s to %s", (runStatus, expected) => {
    expect(fyrarStatusFromRunStatus(runStatus)).toBe(expected);
  });

  it("only ever returns a spec §13 status", () => {
    for (const status of ["queued", "failed", "waiting_input", "idle", "x"]) {
      expect(FYR_RUN_STATUSES).toContain(fyrarStatusFromRunStatus(status));
    }
  });
});
