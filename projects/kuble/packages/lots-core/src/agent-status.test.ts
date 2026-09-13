import { describe, expect, it } from "vitest";
import { AGENT_STATUSES, agentStatusFromRunStatus } from "./agent-status.js";
import { AGENT_TEMPLATES, agentTemplate } from "./agent-templates.js";

describe("agentStatusFromRunStatus", () => {
  it.each([
    [undefined, "IDLE"],
    [null, "IDLE"],
    ["idle", "IDLE"],
    ["completed", "IDLE"],
    ["cancelled", "IDLE"],
    ["queued", "WORKING"],
    ["leased", "WORKING"],
    ["running", "WORKING"],
    ["waiting_input", "WAITING"],
    ["waiting_takeover", "WAITING"],
    ["failed", "ERROR"],
    ["something-new", "IDLE"],
  ] as const)("maps %s to %s", (runStatus, expected) => {
    expect(agentStatusFromRunStatus(runStatus)).toBe(expected);
  });

  it("only ever returns one of the four Ratatosk statuses", () => {
    for (const status of ["queued", "failed", "waiting_input", "idle", "x"]) {
      expect(AGENT_STATUSES).toContain(agentStatusFromRunStatus(status));
    }
  });
});

describe("AGENT_TEMPLATES", () => {
  it("offers the five templates from the spec, Assistant first", () => {
    expect(AGENT_TEMPLATES.map((template) => template.name)).toEqual([
      "Assistant",
      "Researcher",
      "Developer",
      "Sales Scout",
      "Reviewer",
    ]);
    expect(agentTemplate("assistant").description).toBe(
      "General AI coworker for research and organization.",
    );
    expect(AGENT_TEMPLATES.every((template) => template.suggestedRoutine.length > 0)).toBe(true);
  });

  it("gives every template the prompt-injection and approval reminders", () => {
    for (const template of AGENT_TEMPLATES) {
      expect(template.instructions).toContain("untrusted data");
      expect(template.instructions).toContain("approval");
      expect(template.instructions).toContain("Never reveal credentials");
    }
  });

  it("rejects unknown template keys", () => {
    expect(() => agentTemplate("nope" as never)).toThrow(/Unknown agent template/);
  });
});
