import { describe, expect, it, vi } from "vitest";
import { createLotsPacksConnector } from "./connector.js";

const context = {
  operationId: "test",
  traceId: "test",
  spaceId: "space-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

describe("createLotsPacksConnector", () => {
  it("exposes extract/summarize for Web Research and skips builtin search/fetch", async () => {
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["web"],
    });
    const tools = await connector.discoverTools(context);
    expect(tools.map((tool) => tool.name)).toEqual(["web_extract", "web_summarize"]);
  });

  it("runs web.extract without credentials", async () => {
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["web"],
    });
    const events = [];
    for await (const event of connector.execute(
      {
        tool: "web_extract",
        args: { url: "https://example.com", title: "Example", text: "Hello." },
        executionId: "ex-1",
      },
      context,
    )) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({
      type: "result",
      data: expect.objectContaining({
        content: "Hello.",
        title: "Example",
        url: "https://example.com",
      }),
    });
  });

  it("tells the coworker when a GitHub write still needs an account", async () => {
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["github"],
    });
    const events = [];
    for await (const event of connector.execute(
      { tool: "github_createIssue", args: { repo: "a/b", title: "Hi" }, executionId: "ex-2" },
      context,
    )) {
      events.push(event);
    }
    expect(events[0]).toMatchObject({
      type: "error",
      message: expect.stringMatching(/connected/i),
    });
  });

  it("refreshes a Google token once after 401 and retries the tool", async () => {
    const tokens: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const token = new Headers(init?.headers).get("authorization") ?? "";
      tokens.push(token);
      if (token.includes("expired-token")) {
        return new Response("{}", {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id: "msg-2",
          threadId: "thr-2",
          labelIds: ["SENT"],
          access_token: "must-not-leak",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const refreshGoogleToken = vi.fn(async () => "fresh-token");
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["gmail"],
      resolveAccessToken: async () => "expired-token",
      refreshGoogleToken,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const events = [];
    for await (const event of connector.execute(
      {
        tool: "gmail_send",
        args: { to: "anna@example.com", subject: "Hello", body: "Hi" },
        executionId: "ex-401",
      },
      context,
    )) {
      events.push(event);
    }
    expect(refreshGoogleToken).toHaveBeenCalledOnce();
    expect(tokens).toEqual(["Bearer expired-token", "Bearer fresh-token"]);
    expect(events[0]).toMatchObject({
      type: "result",
      data: { id: "msg-2", threadId: "thr-2", labelIds: ["SENT"] },
    });
    expect(JSON.stringify(events[0])).not.toContain("expired-token");
    expect(JSON.stringify(events[0])).not.toContain("fresh-token");
    expect(JSON.stringify(events[0])).not.toContain("must-not-leak");
  });

  it("does not refresh GitHub after 401", async () => {
    const refreshGoogleToken = vi.fn(async () => "fresh-token");
    const connector = createLotsPacksConnector({
      listEnabledPackKeys: async () => ["github"],
      resolveAccessToken: async () => "expired-token",
      refreshGoogleToken,
      fetchImpl: (async () =>
        new Response("{}", {
          status: 401,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    const events = [];
    for await (const event of connector.execute(
      { tool: "github_createIssue", args: { repo: "a/b", title: "Hi" }, executionId: "ex-gh" },
      context,
    )) {
      events.push(event);
    }
    expect(refreshGoogleToken).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "error" });
  });
});
