import { describe, expect, it } from "vitest";
import { createMemoryCalendar, createMemoryGitHub, createMemoryGmail } from "./memory-providers.js";
import {
  createEffectReconcileStore,
  reconcilePackWrite,
  reconcileUncertainEffects,
} from "./reconcile.js";
import { createMemoryWriteStore, runPackWrite } from "./run-write.js";

const scope = {
  organization: "space-1",
  agent: "bot-1",
  run: "run-1",
  tool: "gmail.send",
};

const payload = { to: "anna@example.com", subject: "Hello", body: "Hi Anna" };

describe("runPackWrite", () => {
  it("sends once when the same approved write is replayed", async () => {
    const gmail = createMemoryGmail();
    const store = createMemoryWriteStore();
    const first = await runPackWrite({
      scope,
      payload,
      store,
      execute: () => gmail.send(payload),
    });
    const second = await runPackWrite({
      scope,
      payload,
      store,
      execute: () => gmail.send(payload),
    });
    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.result).toEqual(first.result);
    expect(gmail.sent).toHaveLength(1);
  });

  it("marks a timed-out send UNKNOWN, then SUCCEEDED when reconcile finds it", async () => {
    const gmail = createMemoryGmail();
    const store = createMemoryWriteStore();
    const timedOut = await runPackWrite({
      scope,
      payload,
      store,
      execute: () => gmail.send(payload, "timeout"),
    });
    expect(timedOut.status).toBe("uncertain");
    expect(gmail.sent).toHaveLength(1);

    const lookup = {
      find: async () => gmail.findSent(payload),
    };
    const recovered = await runPackWrite({
      scope,
      payload,
      store,
      execute: () => {
        throw new Error("must not resend");
      },
      lookup,
    });
    expect(recovered.status).toBe("completed");
    expect(recovered.sent).toBe(false);
    expect(recovered.result).toMatchObject({ to: payload.to, subject: payload.subject });
    expect(gmail.sent).toHaveLength(1);

    const effectStore = createEffectReconcileStore({
      externalEffect: {
        findMany: async () => [
          { id: "e-1", kind: "gmail.send", status: "uncertain", request: payload },
        ],
        updateMany: async () => ({ count: 1 }),
      },
    });
    expect(await reconcileUncertainEffects({ store: effectStore, lookup })).toEqual(["e-1"]);
  });
});

describe("reconcilePackWrite", () => {
  it("finds a calendar create and a GitHub issue without writing again", async () => {
    const calendar = createMemoryCalendar([
      { id: "evt-1", title: "Standup", start: "2026-09-13T09:00:00.000Z" },
    ]);
    const github = createMemoryGitHub([
      { id: "issue-1", repo: "acme/app", number: 4, title: "Bug", body: "", comments: [] },
    ]);
    github.comment({ repo: "acme/app", number: 4, body: "Looking." });

    await expect(
      reconcilePackWrite(
        "calendar.createEvent",
        { title: "Standup", start: "2026-09-13T09:00:00.000Z" },
        { find: async ({ request }) => calendar.find(request) },
      ),
    ).resolves.toMatchObject({ status: "succeeded", result: { id: "evt-1" } });

    await expect(
      reconcilePackWrite(
        "github.createIssue",
        { repo: "acme/app", title: "Bug" },
        {
          find: async ({ request }) => github.findIssue(request as { repo: string; title: string }),
        },
      ),
    ).resolves.toMatchObject({ status: "succeeded" });

    await expect(
      reconcilePackWrite(
        "github.commentIssue",
        { repo: "acme/app", number: 4, body: "Looking." },
        {
          find: async ({ request }) =>
            github.findComment(request as { repo: string; number: number; body: string }),
        },
      ),
    ).resolves.toMatchObject({ status: "succeeded" });
  });

  it("returns retry when the provider has no matching write", async () => {
    await expect(
      reconcilePackWrite("gmail.send", payload, { find: async () => null }),
    ).resolves.toEqual({ status: "retry" });
  });
});
