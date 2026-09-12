import { describe, expect, it } from "vitest";
import {
  LOTS_TEAM_KIND,
  TEAM_ROLES,
  teamRoleFromValue,
  teamRoleToValue,
} from "./team-roles.js";

describe("team roles", () => {
  it("round-trips LEAD / SPECIALIST / REVIEWER", () => {
    expect(TEAM_ROLES).toEqual(["LEAD", "SPECIALIST", "REVIEWER"]);
    expect(TEAM_ROLES.map(teamRoleToValue)).toEqual(["lead", "specialist", "reviewer"]);
    expect(teamRoleFromValue("lead")).toBe("LEAD");
    expect(teamRoleFromValue("REVIEWER")).toBe("REVIEWER");
    expect(teamRoleFromValue("")).toBe("SPECIALIST");
    expect(LOTS_TEAM_KIND).toBe("lots-team");
  });
});
