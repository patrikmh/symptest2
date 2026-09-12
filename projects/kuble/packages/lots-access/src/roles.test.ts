import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  can,
  invitationAcceptDenial,
  inviteDenial,
  ROLES,
  type Role,
  roleChangeDenial,
  roleFromSpaceMember,
  roleToSpaceMember,
} from "./roles.js";
import { visibleTo } from "./visibility.js";

const TABLE: Record<Role, Record<(typeof ACTIONS)[number], boolean>> = {
  OWNER: {
    manageOrganization: true,
    manageAdmins: true,
    manageMembers: true,
    installPacks: true,
    configurePacks: true,
    configureSharedConnections: true,
    configureSharedComputers: true,
    configureComputers: true,
    inspectActivity: true,
    createAgents: true,
    useOwnAgents: true,
    connectOwnAccounts: true,
    createFyrar: true,
    useEnabledPacks: true,
    approveOwnAgents: true,
    changeOrgSettings: true,
    removeFinalOwner: false,
  },
  ADMIN: {
    manageOrganization: false,
    manageAdmins: false,
    manageMembers: true,
    installPacks: true,
    configurePacks: true,
    configureSharedConnections: false,
    configureSharedComputers: false,
    configureComputers: true,
    inspectActivity: true,
    createAgents: true,
    useOwnAgents: true,
    connectOwnAccounts: true,
    createFyrar: true,
    useEnabledPacks: true,
    approveOwnAgents: true,
    changeOrgSettings: false,
    removeFinalOwner: false,
  },
  MEMBER: {
    manageOrganization: false,
    manageAdmins: false,
    manageMembers: false,
    installPacks: false,
    configurePacks: false,
    configureSharedConnections: false,
    configureSharedComputers: false,
    configureComputers: false,
    inspectActivity: false,
    createAgents: true,
    useOwnAgents: true,
    connectOwnAccounts: true,
    createFyrar: true,
    useEnabledPacks: true,
    approveOwnAgents: true,
    changeOrgSettings: false,
    removeFinalOwner: false,
  },
};

describe("roleFromSpaceMember", () => {
  it.each([
    ["owner", "OWNER"],
    ["OWNER", "OWNER"],
    ["admin", "ADMIN"],
    ["Admin", "ADMIN"],
    ["member", "MEMBER"],
    ["", "MEMBER"],
    [undefined, "MEMBER"],
    ["guest", "MEMBER"],
  ] as const)("maps %s to %s", (stored, expected) => {
    expect(roleFromSpaceMember(stored)).toBe(expected);
  });
});

describe("roleToSpaceMember", () => {
  it("writes the lowercase SpaceMember.role values", () => {
    expect(ROLES.map(roleToSpaceMember)).toEqual(["owner", "admin", "member"]);
  });
});

describe("can(role, action)", () => {
  it.each(
    ROLES.flatMap((role) => ACTIONS.map((action) => [role, action, TABLE[role][action]] as const)),
  )("%s × %s → %s", (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
  });
});

describe("roleChangeDenial", () => {
  it("rejects demoting the last Owner before any other check", () => {
    expect(
      roleChangeDenial({
        actorRole: "ADMIN",
        targetRole: "OWNER",
        nextRole: "MEMBER",
        ownerCount: 1,
      }),
    ).toBe("last_owner");
    expect(
      roleChangeDenial({
        actorRole: "OWNER",
        targetRole: "OWNER",
        nextRole: "ADMIN",
        ownerCount: 1,
      }),
    ).toBe("last_owner");
  });

  it("lets an Owner demote another Owner when at least one remains", () => {
    expect(
      roleChangeDenial({
        actorRole: "OWNER",
        targetRole: "OWNER",
        nextRole: "ADMIN",
        ownerCount: 2,
      }),
    ).toBeNull();
  });

  it("forbids Admin from changing Owner or Admin roles when more than one Owner exists", () => {
    expect(
      roleChangeDenial({
        actorRole: "ADMIN",
        targetRole: "OWNER",
        nextRole: "MEMBER",
        ownerCount: 2,
      }),
    ).toBe("forbidden");
    expect(
      roleChangeDenial({
        actorRole: "ADMIN",
        targetRole: "MEMBER",
        nextRole: "ADMIN",
        ownerCount: 1,
      }),
    ).toBe("forbidden");
  });

  it("lets Admin change a Member to Member (no-op) and forbids Member from any change", () => {
    expect(
      roleChangeDenial({
        actorRole: "ADMIN",
        targetRole: "MEMBER",
        nextRole: "MEMBER",
        ownerCount: 1,
      }),
    ).toBeNull();
    expect(
      roleChangeDenial({
        actorRole: "MEMBER",
        targetRole: "MEMBER",
        nextRole: "ADMIN",
        ownerCount: 1,
      }),
    ).toBe("forbidden");
  });
});

describe("inviteDenial", () => {
  it("lets Owner invite every role and Admin invite only Members", () => {
    expect(inviteDenial("OWNER", "OWNER")).toBeNull();
    expect(inviteDenial("OWNER", "ADMIN")).toBeNull();
    expect(inviteDenial("OWNER", "MEMBER")).toBeNull();
    expect(inviteDenial("ADMIN", "MEMBER")).toBeNull();
    expect(inviteDenial("ADMIN", "ADMIN")).toBe("forbidden");
    expect(inviteDenial("MEMBER", "MEMBER")).toBe("forbidden");
  });
});

describe("invitationAcceptDenial", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const later = new Date("2026-09-19T12:00:00.000Z");

  it("allows the invited address to accept a live pending invite", () => {
    expect(
      invitationAcceptDenial({
        actorEmail: "Alex@Ratatosk.test",
        invitationEmail: "alex@ratatosk.test",
        status: "pending",
        expiresAt: later,
        now,
      }),
    ).toBeNull();
  });

  it("hides invites addressed to someone else", () => {
    expect(
      invitationAcceptDenial({
        actorEmail: "pat@ratatosk.test",
        invitationEmail: "alex@ratatosk.test",
        status: "pending",
        expiresAt: later,
        now,
      }),
    ).toBe("not_found");
  });

  it("rejects expired and already-consumed invites", () => {
    expect(
      invitationAcceptDenial({
        actorEmail: "alex@ratatosk.test",
        invitationEmail: "alex@ratatosk.test",
        status: "pending",
        expiresAt: now,
        now,
      }),
    ).toBe("expired");
    expect(
      invitationAcceptDenial({
        actorEmail: "alex@ratatosk.test",
        invitationEmail: "alex@ratatosk.test",
        status: "accepted",
        expiresAt: later,
        now,
      }),
    ).toBe("not_pending");
  });
});

describe("visibleTo", () => {
  const space = "space-1";
  const owner = { userId: "user-a", spaceId: space, role: "MEMBER" as const };

  it("shows a resource to its owner in the same space", () => {
    expect(visibleTo(owner, { spaceId: space, ownerUserId: "user-a" })).toBe(true);
  });

  it("hides another member's private resource", () => {
    expect(visibleTo(owner, { spaceId: space, ownerUserId: "user-b" })).toBe(false);
  });

  it("shows another member's resource to Admin and Owner", () => {
    expect(
      visibleTo(
        { userId: "admin-1", spaceId: space, role: "ADMIN" },
        { spaceId: space, ownerUserId: "user-b" },
      ),
    ).toBe(true);
    expect(
      visibleTo(
        { userId: "owner-1", spaceId: space, role: "OWNER" },
        { spaceId: space, ownerUserId: "user-b" },
      ),
    ).toBe(true);
  });

  it("hides resources in another space even from an Owner", () => {
    expect(
      visibleTo(
        { userId: "owner-1", spaceId: space, role: "OWNER" },
        { spaceId: "space-2", ownerUserId: "owner-1" },
      ),
    ).toBe(false);
  });

  it("shows a teammate's resource when sharedViaTeam is set (Phase 8 hook)", () => {
    expect(visibleTo(owner, { spaceId: space, ownerUserId: "user-b", sharedViaTeam: true })).toBe(
      true,
    );
    expect(visibleTo(owner, { spaceId: space, ownerUserId: "user-b", sharedViaTeam: false })).toBe(
      false,
    );
  });
});
