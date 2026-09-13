import { describe, expect, it } from "vitest";
import {
  assertRecurringFyrCrons,
  fyrScheduleWords,
  fyrVisibleTo,
  LotsFyrError,
  mapFyr,
  mapFyrRun,
  nextFyrRunAt,
} from "./fyrar.js";

const actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

describe("assertRecurringFyrCrons", () => {
  it("accepts a repeating cron", () => {
    expect(() => assertRecurringFyrCrons(["0 9 * * *"])).not.toThrow();
  });

  it("rejects empty, one-shot, and mixed schedules", () => {
    expect(() => assertRecurringFyrCrons([])).toThrow(LotsFyrError);
    expect(() => assertRecurringFyrCrons(["@once"])).toThrow(LotsFyrError);
    expect(() => assertRecurringFyrCrons(["@once", "0 9 * * *"])).toThrow(LotsFyrError);
  });
});

describe("nextFyrRunAt", () => {
  it("returns null when the fyr is paused", () => {
    expect(nextFyrRunAt(["0 9 * * *"], "UTC", false)).toBeNull();
  });

  it("rejects an invalid cron", () => {
    expect(() => nextFyrRunAt(["not-a-cron"], "UTC", true)).toThrow(LotsFyrError);
  });
});

describe("mapFyr", () => {
  it("maps a routine row onto the Fyr DTO", () => {
    const fyr = mapFyr({
      id: "fyr-1",
      spaceId: "space-1",
      botId: "bot-1",
      userId: "user-a",
      name: "Morning brief",
      prompt: "Summarise overnight email",
      crons: ["0 9 * * 1-5"],
      timezone: "UTC",
      active: true,
      nextRunAt: new Date("2026-09-14T09:00:00.000Z"),
      lastRunAt: null,
      createdAt: new Date("2026-09-12T00:00:00.000Z"),
      bot: { name: "Assistant", userId: "user-a", archivedAt: null },
    });
    expect(fyr).toMatchObject({
      id: "fyr-1",
      botName: "Assistant",
      instruction: "Summarise overnight email",
      schedule: "Weekdays at 9:00 AM",
      enabled: true,
      nextRunAt: "2026-09-14T09:00:00.000Z",
    });
  });
});

describe("mapFyrRun", () => {
  it("maps Rakazo run status onto spec §13", () => {
    expect(
      mapFyrRun({
        id: "run-1",
        routineId: "fyr-1",
        status: "waiting_input",
        createdAt: new Date("2026-09-12T08:00:00.000Z"),
        completedAt: null,
        error: null,
      }),
    ).toMatchObject({
      fyrId: "fyr-1",
      status: "WAITING_APPROVAL",
    });
  });
});

describe("fyrScheduleWords", () => {
  it("joins several crons", () => {
    expect(fyrScheduleWords(["0 9 * * *", "0 15 * * *"])).toBe(
      "Every day at 9:00 AM · Every day at 3:00 PM",
    );
  });
});

describe("fyrVisibleTo", () => {
  it("hides another member's coworker fyrar from a member", () => {
    expect(fyrVisibleTo(actor, "MEMBER", { spaceId: "space-1", ownerUserId: "user-b" })).toBe(
      false,
    );
  });

  it("shows every fyr in the space to Admin and Owner", () => {
    expect(fyrVisibleTo(actor, "ADMIN", { spaceId: "space-1", ownerUserId: "user-b" })).toBe(true);
    expect(
      fyrVisibleTo({ ...actor, userId: "owner-1" }, "OWNER", {
        spaceId: "space-1",
        ownerUserId: "user-b",
      }),
    ).toBe(true);
  });
});
