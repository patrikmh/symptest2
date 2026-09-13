import { describe, expect, it } from "vitest";
import { workspaceInviteEmail, workspaceInviteSignInUrl } from "./invite-email.js";

describe("workspaceInviteEmail", () => {
  it("points at sign-in and uses Ratatosk copy without an accept token", () => {
    const message = workspaceInviteEmail({
      to: "alex@ratatosk.test",
      inviterName: "Owner",
      organizationName: "Acme",
      webOrigin: "http://127.0.0.1:5173/",
    });
    expect(message.to).toBe("alex@ratatosk.test");
    expect(message.subject).toBe("Owner invited you to Acme on Ratatosk");
    expect(workspaceInviteSignInUrl("http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/sign-in",
    );
    expect(message.text).toContain("http://127.0.0.1:5173/sign-in");
    expect(message.text).toContain("http://127.0.0.1:5173/sign-up");
    expect(message.text).toContain("banner");
    expect(message.text).not.toContain("token=");
    expect(message.html).toContain('href="http://127.0.0.1:5173/sign-in"');
    expect(message.html).not.toContain("<script>");
  });

  it("escapes HTML in names", () => {
    const message = workspaceInviteEmail({
      to: "alex@ratatosk.test",
      inviterName: `<img src=x onerror=alert(1)>`,
      organizationName: `Acme & Co`,
      webOrigin: "https://app.example.com",
    });
    expect(message.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(message.html).toContain("Acme &amp; Co");
    expect(message.html).not.toContain("<img");
  });
});
