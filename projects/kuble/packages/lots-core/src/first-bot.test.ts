import { describe, expect, it } from "vitest";
import { computerHealthFromPayload, computerHealthFromSandbox } from "./computer-health.js";
import { FIRST_BOT_SPAWN_KEY, findFirstBot, firstBotProfile } from "./first-bot.js";

describe("firstBotProfile", () => {
  it("is the Assistant template with the onboarding spawn key", () => {
    const profile = firstBotProfile();
    expect(profile.name).toBe("Assistant");
    expect(profile.description).toBe("General AI coworker for research and organization.");
    expect(profile.title).toBe("General assistant");
    expect(profile.spawnKey).toBe(FIRST_BOT_SPAWN_KEY);
    expect(profile.instructions).toContain("untrusted data");
    expect(profile.computerMode).toBe("team");
    expect(profile.notifyOnFinish).toBe(true);
  });
});

describe("findFirstBot", () => {
  it("prefers the spawn-keyed coworker over a name match", () => {
    const found = findFirstBot([
      { id: "a", name: "Assistant", spawnKey: null },
      { id: "b", name: "Other", spawnKey: FIRST_BOT_SPAWN_KEY },
    ]);
    expect(found?.id).toBe("b");
  });

  it("falls back to Assistant, then a leftover Chief", () => {
    expect(
      findFirstBot([
        { id: "c", name: "Chief", spawnKey: null },
        { id: "a", name: "Assistant", spawnKey: null },
      ])?.id,
    ).toBe("a");
    expect(findFirstBot([{ id: "c", name: "Chief", spawnKey: null }])?.id).toBe("c");
    expect(findFirstBot([{ id: "x", name: "Scout", spawnKey: null }])).toBeUndefined();
  });
});

describe("computerHealthFromSandbox", () => {
  it("treats docker, fake and cloud providers as ready", () => {
    expect(computerHealthFromSandbox("docker")).toEqual({ ready: true, sandbox: "docker" });
    expect(computerHealthFromSandbox("fake")).toEqual({ ready: true, sandbox: "fake" });
    expect(computerHealthFromSandbox("e2b")).toEqual({ ready: true, sandbox: "e2b" });
  });

  it("treats missing or none as not ready", () => {
    expect(computerHealthFromSandbox("none")).toEqual({ ready: false, sandbox: "none" });
    expect(computerHealthFromSandbox("")).toEqual({ ready: false, sandbox: null });
    expect(computerHealthFromSandbox(undefined)).toEqual({ ready: false, sandbox: null });
    expect(computerHealthFromPayload({ sandbox: "docker" }).ready).toBe(true);
    expect(computerHealthFromPayload({})).toEqual({ ready: false, sandbox: null });
    expect(computerHealthFromPayload({ sandbox: "docker", ready: false })).toEqual({
      ready: false,
      sandbox: "docker",
    });
    expect(computerHealthFromPayload({ ok: false, sandbox: "docker" }).ready).toBe(false);
  });
});
