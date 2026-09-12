import { describe, expect, it } from "vitest";
import {
  isPackExternalWrite,
  lotsEffectIdempotencyKey,
  packWriteDestination,
  stableJsonValue,
} from "./idempotency.js";

const base = {
  organization: "space-1",
  agent: "bot-1",
  run: "run-1",
  tool: "gmail.send",
};

describe("lotsEffectIdempotencyKey", () => {
  it("is stable when payload keys are reordered", () => {
    const left = lotsEffectIdempotencyKey({
      ...base,
      payload: { body: "Hi", subject: "Hello", to: "anna@example.com" },
    });
    const right = lotsEffectIdempotencyKey({
      ...base,
      payload: { to: "anna@example.com", subject: "Hello", body: "Hi" },
    });
    expect(left).toBe(right);
    expect(left).toMatch(/^lots:space-1:bot-1:run-1:gmail_send:anna@example.com:[a-f0-9]{64}$/);
    expect(left).not.toContain("Hi");
  });

  it("changes when the destination or body changes", () => {
    const first = lotsEffectIdempotencyKey({
      ...base,
      payload: { to: "anna@example.com", subject: "Hello", body: "one" },
    });
    const otherPerson = lotsEffectIdempotencyKey({
      ...base,
      payload: { to: "ben@example.com", subject: "Hello", body: "one" },
    });
    const otherBody = lotsEffectIdempotencyKey({
      ...base,
      payload: { to: "anna@example.com", subject: "Hello", body: "two" },
    });
    expect(first).not.toBe(otherPerson);
    expect(first).not.toBe(otherBody);
  });

  it("accepts dotted or underscored tool names", () => {
    const payload = { repo: "acme/app", title: "Bug" };
    expect(
      lotsEffectIdempotencyKey({
        organization: "s",
        agent: "a",
        run: "r",
        tool: "github.createIssue",
        payload,
      }),
    ).toBe(
      lotsEffectIdempotencyKey({
        organization: "s",
        agent: "a",
        run: "r",
        tool: "github_createIssue",
        payload,
      }),
    );
  });

  it("leaves read and draft tools to Rakazo's key", () => {
    expect(
      lotsEffectIdempotencyKey({
        ...base,
        tool: "gmail.createDraft",
        payload: { to: "anna@example.com", subject: "Hi" },
      }),
    ).toBeUndefined();
    expect(isPackExternalWrite("gmail.search")).toBe(false);
    expect(isPackExternalWrite("web.search")).toBe(false);
  });
});

describe("packWriteDestination", () => {
  it("uses the recipient, repo, or calendar id", () => {
    expect(packWriteDestination("gmail.send", { to: "a@b.c" })).toBe("a@b.c");
    expect(packWriteDestination("github.commentIssue", { repo: "acme/app" })).toBe("acme/app");
    expect(packWriteDestination("calendar.createEvent", {})).toBe("primary");
  });
});

describe("stableJsonValue", () => {
  it("sorts nested object keys", () => {
    expect(stableJsonValue({ z: { b: 1, a: 2 }, y: true })).toBe('{"y":true,"z":{"a":2,"b":1}}');
  });
});
