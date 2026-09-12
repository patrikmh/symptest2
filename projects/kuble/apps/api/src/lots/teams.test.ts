import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createTeam, LotsTeamError } from "./teams.js";

const actor: Actor = {
  userId: "user-a",
  spaceId: "space-1",
  email: "a@ratatosk.test",
  isDeploymentOwner: false,
};

describe("createTeam", () => {
  it("stores LEAD and REVIEWER on a CapabilityInstall and never writes extra grants", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "team-1",
      spaceId: "space-1",
      userId: "user-a",
      name: "Research desk",
      config: {
        members: [
          { botId: "bot-lead", role: "lead" },
          { botId: "bot-rev", role: "reviewer" },
        ],
      },
      createdAt: new Date("2026-09-12T00:00:00.000Z"),
    });
    const prisma = {
      bot: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "bot-lead", name: "Researcher", userId: "user-a" },
            { id: "bot-rev", name: "Reviewer", userId: "user-a" },
          ])
          .mockResolvedValueOnce([
            { id: "bot-lead", name: "Researcher", userId: "user-a" },
            { id: "bot-rev", name: "Reviewer", userId: "user-a" },
          ]),
      },
      capabilityInstall: { create },
    };
    const team = await createTeam(prisma as never, actor, "MEMBER", {
      name: "Research desk",
      members: [
        { botId: "bot-lead", role: "lead" },
        { botId: "bot-rev", role: "reviewer" },
      ],
    });
    expect(team.members.map((member) => member.role)).toEqual(["lead", "reviewer"]);
    expect(create.mock.calls[0]?.[0].data.kind).toBe("lots-team");
    expect(create.mock.calls[0]?.[0].data.config).toEqual({
      members: [
        { botId: "bot-lead", role: "lead" },
        { botId: "bot-rev", role: "reviewer" },
      ],
    });
  });

  it("rejects a team without a lead", async () => {
    await expect(
      createTeam({} as never, actor, "MEMBER", {
        name: "Nope",
        members: [
          { botId: "a", role: "specialist" },
          { botId: "b", role: "reviewer" },
        ],
      }),
    ).rejects.toBeInstanceOf(LotsTeamError);
  });
});
