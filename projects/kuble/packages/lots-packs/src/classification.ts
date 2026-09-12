export const PACK_CLASSIFICATIONS = ["READ", "DRAFT", "EXTERNAL_WRITE", "DESTRUCTIVE"] as const;
export type PackClassification = (typeof PACK_CLASSIFICATIONS)[number];

export function isPackClassification(value: unknown): value is PackClassification {
  return typeof value === "string" && (PACK_CLASSIFICATIONS as readonly string[]).includes(value);
}

/** Spec §16 / §27: only external writes and destructive tools wait for a yes. */
export function classificationRequiresApproval(classification: PackClassification): boolean {
  return classification === "EXTERNAL_WRITE" || classification === "DESTRUCTIVE";
}

export function normalizePackToolName(name: string): string {
  return name.trim().replaceAll(".", "_");
}
