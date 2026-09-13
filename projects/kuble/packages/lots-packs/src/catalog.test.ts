import { describe, expect, it } from "vitest";
import { calendarPack, githubPack, gmailPack, LOTS_PACKS, webResearchPack } from "./catalog.js";
import { PACK_CLASSIFICATIONS } from "./classification.js";

describe("LOTS packs", () => {
  it("registers the four MVP packs", () => {
    expect(LOTS_PACKS.map((pack) => pack.key)).toEqual(["web", "github", "gmail", "calendar"]);
  });

  it("gives every tool a spec §27 classification", () => {
    for (const pack of LOTS_PACKS) {
      for (const tool of pack.tools) {
        expect(PACK_CLASSIFICATIONS).toContain(tool.classification);
      }
    }
  });

  it("lists GitHub tools from spec §24", () => {
    expect(githubPack.tools.map((tool) => tool.name)).toEqual([
      "github.listRepos",
      "github.searchRepos",
      "github.listIssues",
      "github.readIssue",
      "github.listPulls",
      "github.readPull",
      "github.createIssue",
      "github.commentIssue",
      "github.commentPull",
      "github.mergePull",
    ]);
  });

  it("lists Gmail tools from spec §25", () => {
    expect(gmailPack.tools.map((tool) => tool.name)).toEqual([
      "gmail.search",
      "gmail.readThread",
      "gmail.createDraft",
      "gmail.send",
    ]);
  });

  it("lists Calendar tools from spec §26", () => {
    expect(calendarPack.tools.map((tool) => tool.name)).toEqual([
      "calendar.listEvents",
      "calendar.searchEvents",
      "calendar.checkAvailability",
      "calendar.createEvent",
      "calendar.updateEvent",
      "calendar.deleteEvent",
    ]);
  });

  it("enables Web Research by default and leaves the others off", () => {
    expect(webResearchPack.enabledByDefault).toBe(true);
    expect(githubPack.enabledByDefault).toBe(false);
    expect(gmailPack.enabledByDefault).toBe(false);
    expect(calendarPack.enabledByDefault).toBe(false);
  });
});
