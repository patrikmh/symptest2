import { describe, expect, it, vi } from "vitest";
import { createLotsPacksConnector } from "./connector.js";
import { executePackTool, findPackWrite } from "./execute.js";
import { PackProviderError } from "./http.js";
import { applyGoogleAccessToken, packTokensFromSecret, refreshGoogleAccessToken } from "./token.js";

const context = {
  operationId: "test",
  traceId: "test",
  spaceId: "space-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("executePackTool", () => {
  it("creates a GitHub issue over HTTP without putting the token in the result", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/repos/acme/app/issues");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")?.startsWith("Bearer ")).toBe(true);
      return jsonResponse({
        id: 9,
        number: 4,
        title: "Bug",
        html_url: "https://github.com/acme/app/issues/4",
        access_token: "must-not-leak",
      });
    });
    const result = await executePackTool(
      "github.createIssue",
      { repo: "acme/app", title: "Bug", body: "Steps" },
      { accessToken: "secret-token", fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result).toEqual({
      id: 9,
      number: 4,
      title: "Bug",
      html_url: "https://github.com/acme/app/issues/4",
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("sends Gmail through users.messages.send", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/gmail/v1/users/me/messages/send");
      return jsonResponse({ id: "msg-1", threadId: "thr-1", labelIds: ["SENT"] });
    });
    await expect(
      executePackTool(
        "gmail.send",
        { to: "anna@example.com", subject: "Hello", body: "Hi" },
        { accessToken: "google-token", fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).resolves.toEqual({ id: "msg-1", threadId: "thr-1", labelIds: ["SENT"] });
  });

  it("creates a calendar event", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/calendar/v3/calendars/primary/events");
      expect(init?.method).toBe("POST");
      return jsonResponse({
        id: "evt-1",
        summary: "Standup",
        start: { dateTime: "2026-09-13T09:00:00.000Z" },
        htmlLink: "https://calendar.google.com/event?eid=1",
      });
    });
    await expect(
      executePackTool(
        "calendar.createEvent",
        { title: "Standup", start: "2026-09-13T09:00:00.000Z" },
        { accessToken: "google-token", fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).resolves.toMatchObject({ id: "evt-1", summary: "Standup" });
  });

  it("refuses to run without an access token", async () => {
    await expect(executePackTool("gmail.search", { query: "in:inbox" })).rejects.toBeInstanceOf(
      PackProviderError,
    );
  });
});

describe("findPackWrite", () => {
  it("finds a sent Gmail by to and subject", async () => {
    let requested = "";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      requested = String(url);
      return jsonResponse({ messages: [{ id: "msg-1", threadId: "thr-1" }] });
    });
    await expect(
      findPackWrite(
        "gmail.send",
        { to: "anna@example.com", subject: "Hello" },
        { accessToken: "google-token", fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).resolves.toEqual({ id: "msg-1", threadId: "thr-1" });
    expect(requested).toContain("in%3Asent");
  });
});

describe("pack tokens", () => {
  it("reads access_token from the stored OAuth JSON", () => {
    expect(
      packTokensFromSecret(JSON.stringify({ access_token: "tok", refresh_token: "ref" })),
    ).toEqual({ accessToken: "tok", refreshToken: "ref" });
    expect(packTokensFromSecret("nope")).toBeNull();
  });

  it("refreshes a Google access token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ access_token: "next" }));
    await expect(
      refreshGoogleAccessToken({
        refreshToken: "ref",
        clientId: "id",
        clientSecret: "secret",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("next");
  });

  it("keeps the stored refresh token when applying a new access token", () => {
    expect(
      applyGoogleAccessToken(
        JSON.stringify({ access_token: "old", refresh_token: "ref", scope: "gmail" }),
        "fresh",
      ),
    ).toBe(JSON.stringify({ access_token: "fresh", refresh_token: "ref", scope: "gmail" }));
  });
});

describe("connected connector execute", () => {
  it("runs a GitHub write when a token is resolved", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 1, number: 2, title: "Hi", html_url: "https://example.com/2" }),
    );
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["github"],
      resolveAccessToken: async () => "resolved-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const events = [];
    for await (const event of connector.execute(
      { tool: "github_createIssue", args: { repo: "a/b", title: "Hi" }, executionId: "ex-3" },
      context,
    )) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({ type: "result", data: { number: 2, title: "Hi" } });
  });
});
