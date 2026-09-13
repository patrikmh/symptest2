import { agentTemplate, FIRST_BOT_SPAWN_KEY } from "@lots/core";
import { describe, expect, it } from "vitest";
import {
  DEMO_AGENT_KEYS,
  DEMO_APPROVALS,
  DEMO_FYRAR,
  demoEffectKey,
  demoSpawnKey,
} from "./demo-seed.js";

describe("demo seed plan", () => {
  it("covers Assistant, Researcher, Developer and Reviewer (spec §50)", () => {
    expect(DEMO_AGENT_KEYS).toEqual(["assistant", "researcher", "developer", "reviewer"]);
    expect(demoSpawnKey("assistant")).toBe(FIRST_BOT_SPAWN_KEY);
    expect(demoSpawnKey("researcher")).toBe("lots-demo:researcher");
    expect(DEMO_AGENT_KEYS.map((key) => agentTemplate(key).name)).toEqual([
      "Assistant",
      "Researcher",
      "Developer",
      "Reviewer",
    ]);
  });

  it("seeds two fyrar and two example approvals", () => {
    expect(DEMO_FYRAR.map((fyr) => fyr.name)).toEqual(["Morning brief", "Weekly sources"]);
    expect(DEMO_FYRAR.every((fyr) => fyr.cron.split(" ").length === 5)).toBe(true);
    expect(DEMO_APPROVALS.map((row) => row.status)).toEqual(["intended", "completed"]);
    expect(demoEffectKey("gmail-send")).toBe("lots-demo:approval:gmail-send");
  });
});
