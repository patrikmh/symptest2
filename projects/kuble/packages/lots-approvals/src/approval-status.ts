/**
 * Approval lifecycle (spec §16) derived from Rakazo's `ExternalEffect.status`.
 * `expired` is written by `approval.expire`; it is not an upstream create-time status.
 */
export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CONSUMED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
export const APPROVAL_EXPIRE_SWEEP_MS = 15 * 60 * 1000;

const TABLE: Record<string, ApprovalStatus> = {
  intended: "PENDING",
  approved: "APPROVED",
  denied: "REJECTED",
  expired: "EXPIRED",
  executing: "CONSUMED",
  completed: "CONSUMED",
  uncertain: "CONSUMED",
};

export function approvalStatusFromEffect(
  effectStatus: string | null | undefined,
  createdAt?: Date | string | null,
  now = new Date(),
): ApprovalStatus {
  if (effectStatus === "intended" && createdAt && isStaleIntended(createdAt, now)) {
    return "EXPIRED";
  }
  if (!effectStatus) return "PENDING";
  return TABLE[effectStatus] ?? "PENDING";
}

export function isStaleIntended(
  createdAt: Date | string,
  now = new Date(),
  ttlMs = APPROVAL_TTL_MS,
): boolean {
  const at = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return now.getTime() - at.getTime() >= ttlMs;
}
