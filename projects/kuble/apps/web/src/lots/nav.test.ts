import { describe, expect, it } from "vitest";
import { activeNavKey, LOTS_NAV } from "./nav";

describe("Ratatosk navigation", () => {
  it("lists the spec §29 items in order, split into two groups", () => {
    expect(LOTS_NAV.map((item) => item.key)).toEqual([
      "inbox",
      "agents",
      "fyrar",
      "approvals",
      "packs",
      "activity",
      "computers",
      "admin",
      "settings",
    ]);
    expect(LOTS_NAV.filter((item) => item.secondary).map((item) => item.key)).toEqual([
      "computers",
      "admin",
      "settings",
    ]);
  });

  it("puts Inbox, Coworkers and Fyrar in the mobile bar and the rest under More", () => {
    expect(LOTS_NAV.filter((item) => item.mobile).map((item) => item.key)).toEqual([
      "inbox",
      "agents",
      "fyrar",
    ]);
  });

  it("keeps every href under /app so the frame stays mounted", () => {
    for (const item of LOTS_NAV) expect(item.href.startsWith("/app")).toBe(true);
  });

  it.each([
    ["/app", "agents"],
    ["/app/agents", "agents"],
    ["/app/inbox", "inbox"],
    ["/app/fyrar", "fyrar"],
    ["/app/approvals", "approvals"],
    ["/app/packs", "packs"],
    ["/app/activity", "activity"],
    ["/app/computers", "computers"],
    ["/app/admin", "admin"],
    ["/app/bot_123", "agents"],
    ["/app/g/group_9", "agents"],
    ["/sign-in", null],
  ] as const)("highlights %s as %s", (pathname, expected) => {
    expect(activeNavKey(pathname)).toBe(expected);
  });
});
