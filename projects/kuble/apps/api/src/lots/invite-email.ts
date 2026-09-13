import type { TransactionalEmail } from "@rakazo/adapter-kit";

export function workspaceInviteSignInUrl(webOrigin: string): string {
  return new URL("/sign-in", webOrigin.replace(/\/$/, "")).href;
}

/** Product-owned invite copy. Delivery stays on TransactionalEmailProvider. */
export function workspaceInviteEmail(input: {
  to: string;
  inviterName: string;
  organizationName: string;
  webOrigin: string;
}): TransactionalEmail {
  const inviter = input.inviterName.trim() || "Someone";
  const organization = input.organizationName.trim() || "a workspace";
  const signInUrl = workspaceInviteSignInUrl(input.webOrigin);
  const signUpUrl = new URL("/sign-up", input.webOrigin.replace(/\/$/, "")).href;
  return {
    to: input.to,
    subject: `${inviter} invited you to ${organization} on Ratatosk`,
    text: [
      `${inviter} invited you to ${organization} on Ratatosk.`,
      "",
      "Create an account or sign in with this email address:",
      signInUrl,
      "",
      `New here? ${signUpUrl}`,
      "",
      "After you sign in, join from the banner at the top of the app.",
      "This invite expires in 7 days. If you were not expecting it, ignore this email.",
    ].join("\n"),
    html: [
      `<p>${escapeHtml(inviter)} invited you to ${escapeHtml(organization)} on Ratatosk.</p>`,
      `<p>Create an account or <a href="${escapeHtml(signInUrl)}">sign in</a> with this email address.</p>`,
      `<p>New here? <a href="${escapeHtml(signUpUrl)}">Create an account</a>.</p>`,
      "<p>After you sign in, join from the banner at the top of the app.</p>",
      "<p>This invite expires in 7 days. If you were not expecting it, ignore this email.</p>",
    ].join(""),
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
