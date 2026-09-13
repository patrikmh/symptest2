import { describe, expect, it } from "vitest";
import { formatFyrWhen, fyrRunLabel } from "./fyr-format";

describe("fyrRunLabel", () => {
  it("covers every spec §13 status", () => {
    expect(fyrRunLabel("QUEUED")).toBe("Queued");
    expect(fyrRunLabel("RUNNING")).toBe("Running");
    expect(fyrRunLabel("WAITING_APPROVAL")).toBe("Needs you");
    expect(fyrRunLabel("SUCCEEDED")).toBe("Done");
    expect(fyrRunLabel("FAILED")).toBe("Failed");
    expect(fyrRunLabel("CANCELLED")).toBe("Cancelled");
  });
});

describe("formatFyrWhen", () => {
  it("returns null when there is no time", () => {
    expect(formatFyrWhen(null, "UTC")).toBeNull();
  });

  it("formats an ISO instant in the given zone", () => {
    expect(formatFyrWhen("2026-09-14T09:00:00.000Z", "UTC")).toContain("2026");
  });
});
