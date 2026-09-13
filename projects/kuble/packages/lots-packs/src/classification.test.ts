import { describe, expect, it } from "vitest";
import { lotsToolRequiresApproval } from "./approval.js";
import { LOTS_PACKS } from "./catalog.js";
import { classificationRequiresApproval, normalizePackToolName } from "./classification.js";
import { definePack, packToolRequiresApproval } from "./define-pack.js";

describe("definePack", () => {
  it("refuses a tool without a classification", () => {
    expect(() =>
      definePack({
        key: "web",
        name: "Broken",
        description: "",
        connection: "none",
        enabledByDefault: true,
        tools: [
          {
            name: "web.search",
            classification: undefined as never,
            description: "",
            inputSchema: {},
          },
        ],
      }),
    ).toThrow(/classification/);
  });
});

describe("pack classification", () => {
  it("requires approval only for EXTERNAL_WRITE and DESTRUCTIVE", () => {
    expect(classificationRequiresApproval("READ")).toBe(false);
    expect(classificationRequiresApproval("DRAFT")).toBe(false);
    expect(classificationRequiresApproval("EXTERNAL_WRITE")).toBe(true);
    expect(classificationRequiresApproval("DESTRUCTIVE")).toBe(true);
  });

  it.each([
    ["gmail.send", true],
    ["gmail_send", true],
    ["gmail.createDraft", false],
    ["gmail.search", false],
    ["github.createIssue", true],
    ["github.mergePull", true],
    ["github.listRepos", false],
    ["calendar.createEvent", true],
    ["calendar.deleteEvent", true],
    ["calendar.listEvents", false],
    ["web.search", false],
    ["web_extract", false],
  ] as const)("%s requires approval: %s", (tool, expected) => {
    expect(packToolRequiresApproval(LOTS_PACKS, tool)).toBe(expected);
    expect(lotsToolRequiresApproval(normalizePackToolName(tool), true)).toBe(expected);
  });

  it("lets a Gmail draft through even though the name contains create", () => {
    expect(lotsToolRequiresApproval("gmail_createDraft", true)).toBe(false);
  });
});
