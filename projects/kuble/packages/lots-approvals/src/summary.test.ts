import { describe, expect, it } from "vitest";
import { approvalPreview, approvalSummary, extractApprovalArgs } from "./summary.js";

describe("extractApprovalArgs", () => {
  it("unwraps a catalog approval envelope", () => {
    expect(extractApprovalArgs(["marker", "gmail_execute_tool", { to: "a@b.test" }])).toEqual({
      to: "a@b.test",
    });
  });

  it("passes a direct object through", () => {
    expect(extractApprovalArgs({ subject: "Hi" })).toEqual({ subject: "Hi" });
  });
});

describe("approvalPreview", () => {
  it("keeps the fields an approvals card can show", () => {
    expect(
      approvalPreview({ to: "anna@example.com", subject: "Follow-up", extra: "skip" }),
    ).toEqual({
      to: "anna@example.com",
      subject: "Follow-up",
    });
  });
});

describe("approvalSummary", () => {
  it("prefers the ask card text", () => {
    expect(approvalSummary("gmail_send_email", {}, "Review before sending email?")).toBe(
      "sending email",
    );
  });

  it("falls back to the tool and a target", () => {
    expect(approvalSummary("gmail_send_email", { to: "anna@example.com" })).toBe(
      "gmail_send_email → anna@example.com",
    );
  });
});
