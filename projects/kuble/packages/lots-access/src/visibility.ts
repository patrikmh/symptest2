import type { Role } from "./roles.js";

export type AccessActor = {
  userId: string;
  spaceId: string;
  role: Role;
};

export type OwnedResource = {
  spaceId: string;
  ownerUserId: string;
  /** Teams land in Phase 8; treat as false until then. */
  sharedViaTeam?: boolean;
};

/**
 * Spec §7: same space AND (owner OR Admin/Owner OR explicitly shared).
 */
export function visibleTo(actor: AccessActor, resource: OwnedResource): boolean {
  if (actor.spaceId !== resource.spaceId) return false;
  if (resource.ownerUserId === actor.userId) return true;
  if (actor.role === "OWNER" || actor.role === "ADMIN") return true;
  return resource.sharedViaTeam === true;
}
