/** Space roles (spec §6). Stored on `SpaceMember.role` as lowercase strings. */
export const ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const SPACE_ROLE_VALUES = ["owner", "admin", "member"] as const;
export type SpaceRoleValue = (typeof SPACE_ROLE_VALUES)[number];

/**
 * Capabilities from spec §6. OWNER has every org-wide action except removing
 * the final Owner; MEMBER is limited to their own agents and accounts.
 */
export const ACTIONS = [
  "manageOrganization",
  "manageAdmins",
  "manageMembers",
  "installPacks",
  "configurePacks",
  "configureSharedConnections",
  "configureSharedComputers",
  "configureComputers",
  "inspectActivity",
  "createAgents",
  "useOwnAgents",
  "connectOwnAccounts",
  "createFyrar",
  "useEnabledPacks",
  "approveOwnAgents",
  "changeOrgSettings",
  "removeFinalOwner",
] as const;
export type Action = (typeof ACTIONS)[number];

const MEMBER_ACTIONS = new Set<Action>([
  "createAgents",
  "useOwnAgents",
  "connectOwnAccounts",
  "createFyrar",
  "useEnabledPacks",
  "approveOwnAgents",
]);

const ADMIN_ACTIONS = new Set<Action>([
  ...MEMBER_ACTIONS,
  "manageMembers",
  "installPacks",
  "configurePacks",
  "configureComputers",
  "inspectActivity",
]);

const OWNER_ACTIONS = new Set<Action>(ACTIONS.filter((action) => action !== "removeFinalOwner"));

const GRANTS: Record<Role, ReadonlySet<Action>> = {
  OWNER: OWNER_ACTIONS,
  ADMIN: ADMIN_ACTIONS,
  MEMBER: MEMBER_ACTIONS,
};

export function roleFromSpaceMember(value: string | null | undefined): Role {
  switch (value?.trim().toLowerCase()) {
    case "owner":
      return "OWNER";
    case "admin":
      return "ADMIN";
    default:
      return "MEMBER";
  }
}

export function roleToSpaceMember(role: Role): SpaceRoleValue {
  switch (role) {
    case "OWNER":
      return "owner";
    case "ADMIN":
      return "admin";
    case "MEMBER":
      return "member";
  }
}

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].has(action);
}

export type RoleChangeDenial = "forbidden" | "last_owner";

/**
 * Who may change a member's stored role, and whether the last Owner would
 * disappear. Last-owner is checked first so the API can return a specific error.
 */
export function roleChangeDenial(input: {
  actorRole: Role;
  targetRole: Role;
  nextRole: Role;
  ownerCount: number;
}): RoleChangeDenial | null {
  if (input.targetRole === input.nextRole) return null;
  if (input.targetRole === "OWNER" && input.nextRole !== "OWNER" && input.ownerCount <= 1) {
    return "last_owner";
  }
  const touchesAdminOrOwner =
    input.targetRole === "OWNER" ||
    input.nextRole === "OWNER" ||
    input.targetRole === "ADMIN" ||
    input.nextRole === "ADMIN";
  if (touchesAdminOrOwner && !can(input.actorRole, "manageAdmins")) return "forbidden";
  if (!can(input.actorRole, "manageMembers")) return "forbidden";
  return null;
}

export function inviteDenial(actorRole: Role, invitedRole: Role): "forbidden" | null {
  if (invitedRole === "OWNER" || invitedRole === "ADMIN") {
    return can(actorRole, "manageAdmins") ? null : "forbidden";
  }
  return can(actorRole, "manageMembers") ? null : "forbidden";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type InvitationAcceptDenial = "not_found" | "expired" | "not_pending";

/**
 * Whether the signed-in address may consume this invitation row. Mismatched
 * email is `not_found` so the API does not leak that the invite exists.
 */
export function invitationAcceptDenial(input: {
  actorEmail: string;
  invitationEmail: string;
  status: string;
  expiresAt: Date | string;
  now?: Date;
}): InvitationAcceptDenial | null {
  if (normalizeEmail(input.actorEmail) !== normalizeEmail(input.invitationEmail)) {
    return "not_found";
  }
  const expiresAt = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) {
    return "expired";
  }
  if (input.status !== "pending") return "not_pending";
  return null;
}
