import { describe, expect, it } from "vitest";
import { webExtract, webSummarize } from "./web-research.js";

const page = {
  url: "https://example.com/brief",
  title: "Morning brief",
  text: "First sentence. Second sentence! Third sentence? Fourth is extra.",
};

describe("web research results", () => {
  it("extracts content, title, URL and a timestamp", () => {
    const result = webExtract(page, new Date("2026-09-12T21:00:00.000Z"));
    expect(result).toEqual({
      content: page.text,
      title: "Morning brief",
      url: "https://example.com/brief",
      timestamp: "2026-09-12T21:00:00.000Z",
    });
  });

  it("summarises to the first sentences and keeps the source", () => {
    const result = webSummarize(page, 2, new Date("2026-09-12T21:00:00.000Z"));
    expect(result.content).toBe("First sentence. Second sentence!");
    expect(result.title).toBe("Morning brief");
    expect(result.url).toBe("https://example.com/brief");
    expect(result.timestamp).toBe("2026-09-12T21:00:00.000Z");
  });
});
