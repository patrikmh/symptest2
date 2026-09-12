import { describe, expect, it } from "vitest";
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
});
