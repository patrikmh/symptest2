import { describe, expect, it } from "vitest";
import { enabledPackKeys } from "./settings.js";

describe("enabledPackKeys", () => {
  it("defaults Web Research on and the others off", () => {
    expect(enabledPackKeys([])).toEqual(["web"]);
  });

  it("honours stored overrides", () => {
    expect(
      enabledPackKeys([
        { name: "web", config: { enabled: false } },
        { name: "gmail", config: { enabled: true } },
      ]),
    ).toEqual(["gmail"]);
  });
});
