import { describe, expect, it } from "vitest";
import {
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  googleOAuthClientsFromEnv,
  packOAuthRedirectUri,
} from "./oauth.js";

describe("pack OAuth URLs", () => {
  it("builds a Google authorize URL with Gmail and Calendar scopes", () => {
    const url = new URL(
      googleAuthorizeUrl({
        clientId: "google-client",
        redirectUri: "http://127.0.0.1:5173/app/packs/oauth",
        state: "state-1",
      }),
    );
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("scope")).toContain("gmail.send");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
  });

  it("builds a GitHub authorize URL", () => {
    const url = new URL(
      githubAuthorizeUrl({
        clientId: "gh-client",
        redirectUri: "http://127.0.0.1:5173/app/packs/oauth",
        state: "state-2",
      }),
    );
    expect(url.hostname).toBe("github.com");
    expect(url.searchParams.get("scope")).toContain("repo");
  });

  it("keeps the OAuth return path under /app/packs", () => {
    expect(packOAuthRedirectUri("http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/app/packs/oauth",
    );
  });

  it("reads Google clients from GOOGLE_* or LOTS_GOOGLE_*", () => {
    expect(
      googleOAuthClientsFromEnv({
        LOTS_GOOGLE_CLIENT_ID: "lots-id",
        LOTS_GOOGLE_CLIENT_SECRET: "lots-secret",
      }),
    ).toEqual({ clientId: "lots-id", clientSecret: "lots-secret" });
    expect(
      googleOAuthClientsFromEnv({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        LOTS_GOOGLE_CLIENT_ID: "lots-id",
      }),
    ).toEqual({ clientId: "id", clientSecret: "secret" });
  });
});
