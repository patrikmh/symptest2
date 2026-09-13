import { describe, expect, it } from "vitest";
import { formatActivityEvent } from "./activity-format.js";

describe("formatActivityEvent", () => {
  it("writes the spec §36 timeline lines, including delegation", () => {
    expect(
      formatActivityEvent({
        type: "run.started",
        botName: "Researcher",
        payload: { name: "Daily Lead Scan" },
      }).text,
    ).toBe("Researcher started Daily Lead Scan");
    expect(formatActivityEvent({ type: "run.completed", botName: "Researcher" }).text).toBe(
      "Researcher finished",
    );
    expect(
      formatActivityEvent({
        type: "thread.ask",
        botName: "Researcher",
      }).kind,
    ).toBe("approval");
    expect(
      formatActivityEvent({
        type: "thread.subagent",
        botName: "Researcher",
        peerName: "Reviewer",
        payload: { task: "review the brief." },
      }),
    ).toMatchObject({
      kind: "delegation",
      text: "Researcher asked Reviewer to review the brief",
    });
    expect(
      formatActivityEvent({
        type: "group.handoff",
        botName: "Researcher",
        peerName: "Reviewer",
        payload: { text: "Please review" },
      }).text,
    ).toBe("Researcher asked Reviewer to Please review");
  });

  it("redacts tokens in activity text and details", () => {
    const line = formatActivityEvent({
      type: "agent.tool.called",
      botName: "Developer",
      payload: { tool: "github.createIssue", access_token: "secret", error: "Bearer abc.def" },
    });
    expect(line.detail.tool).toBe("github createIssue");
    expect(JSON.stringify(line)).not.toContain("secret");
    expect(line.detail.error).toBe("[redacted]");
  });
});
