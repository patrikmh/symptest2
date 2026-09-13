/** Agent-team roles (spec §10). Stored lowercase on CapabilityInstall config. */
export const TEAM_ROLES = ["LEAD", "SPECIALIST", "REVIEWER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_VALUES = ["lead", "specialist", "reviewer"] as const;
export type TeamRoleValue = (typeof TEAM_ROLE_VALUES)[number];

export const LOTS_TEAM_KIND = "lots-team";

export function teamRoleFromValue(value: string | null | undefined): TeamRole {
  switch (value?.trim().toLowerCase()) {
    case "lead":
      return "LEAD";
    case "reviewer":
      return "REVIEWER";
    default:
      return "SPECIALIST";
  }
}

export function teamRoleToValue(role: TeamRole): TeamRoleValue {
  switch (role) {
    case "LEAD":
      return "lead";
    case "REVIEWER":
      return "reviewer";
    default:
      return "specialist";
  }
}
