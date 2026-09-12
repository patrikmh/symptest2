import { definePack, type PackDefinition, type PackKey } from "./define-pack.js";
import { webExtract, webSummarize } from "./web-research.js";

const stringProp = (description: string) => ({
  type: "object",
  additionalProperties: false,
  properties: { value: { type: "string", description } },
});

export const webResearchPack = definePack({
  key: "web",
  name: "Web Research",
  description: "Search the public web and read pages. On by default; no account needed.",
  connection: "none",
  enabledByDefault: true,
  tools: [
    {
      name: "web.search",
      classification: "READ",
      description: "Search the public web. Wraps builtin web_search.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
    {
      name: "web.fetch",
      classification: "READ",
      description: "Fetch a public page. Wraps builtin web_fetch.",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: { url: { type: "string" } },
      },
    },
    {
      name: "web.extract",
      classification: "READ",
      description: "Extract the readable text from an already-fetched page.",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
        },
      },
      execute: (args) =>
        webExtract({
          url: String(args.url ?? ""),
          title: args.title ? String(args.title) : undefined,
          text: args.text ? String(args.text) : undefined,
        }),
    },
    {
      name: "web.summarize",
      classification: "READ",
      description: "Summarise a page into a few sentences with the source attached.",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          text: { type: "string" },
        },
      },
      execute: (args) =>
        webSummarize({
          url: String(args.url ?? ""),
          title: args.title ? String(args.title) : undefined,
          text: args.text ? String(args.text) : undefined,
        }),
    },
  ],
});

export const githubPack = definePack({
  key: "github",
  name: "GitHub",
  description: "Read repositories and open or comment on work, after you connect GitHub.",
  connection: "github",
  enabledByDefault: false,
  tools: [
    {
      name: "github.listRepos",
      classification: "READ",
      description: "List repositories the connected account can see.",
      inputSchema: stringProp("optional query"),
    },
    {
      name: "github.searchRepos",
      classification: "READ",
      description: "Search repositories.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
    {
      name: "github.listIssues",
      classification: "READ",
      description: "List issues in a repository.",
      inputSchema: {
        type: "object",
        required: ["repo"],
        properties: { repo: { type: "string" } },
      },
    },
    {
      name: "github.readIssue",
      classification: "READ",
      description: "Read one issue.",
      inputSchema: {
        type: "object",
        required: ["repo", "number"],
        properties: { repo: { type: "string" }, number: { type: "number" } },
      },
    },
    {
      name: "github.listPulls",
      classification: "READ",
      description: "List pull requests in a repository.",
      inputSchema: {
        type: "object",
        required: ["repo"],
        properties: { repo: { type: "string" } },
      },
    },
    {
      name: "github.readPull",
      classification: "READ",
      description: "Read one pull request.",
      inputSchema: {
        type: "object",
        required: ["repo", "number"],
        properties: { repo: { type: "string" }, number: { type: "number" } },
      },
    },
    {
      name: "github.createIssue",
      classification: "EXTERNAL_WRITE",
      description: "Create an issue.",
      inputSchema: {
        type: "object",
        required: ["repo", "title"],
        properties: {
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    {
      name: "github.commentIssue",
      classification: "EXTERNAL_WRITE",
      description: "Comment on an issue.",
      inputSchema: {
        type: "object",
        required: ["repo", "number", "body"],
        properties: {
          repo: { type: "string" },
          number: { type: "number" },
          body: { type: "string" },
        },
      },
    },
    {
      name: "github.commentPull",
      classification: "EXTERNAL_WRITE",
      description: "Comment on a pull request.",
      inputSchema: {
        type: "object",
        required: ["repo", "number", "body"],
        properties: {
          repo: { type: "string" },
          number: { type: "number" },
          body: { type: "string" },
        },
      },
    },
    {
      name: "github.mergePull",
      classification: "DESTRUCTIVE",
      description: "Merge a pull request.",
      inputSchema: {
        type: "object",
        required: ["repo", "number"],
        properties: { repo: { type: "string" }, number: { type: "number" } },
      },
    },
  ],
});

export const gmailPack = definePack({
  key: "gmail",
  name: "Gmail",
  description: "Search mail, draft, and send — send waits for a yes.",
  connection: "google",
  enabledByDefault: false,
  tools: [
    {
      name: "gmail.search",
      classification: "READ",
      description: "Search mail.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
    {
      name: "gmail.readThread",
      classification: "READ",
      description: "Read a thread.",
      inputSchema: {
        type: "object",
        required: ["threadId"],
        properties: { threadId: { type: "string" } },
      },
    },
    {
      name: "gmail.createDraft",
      classification: "DRAFT",
      description: "Create a draft. Does not send.",
      inputSchema: {
        type: "object",
        required: ["to", "subject"],
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    {
      name: "gmail.send",
      classification: "EXTERNAL_WRITE",
      description: "Send an email.",
      inputSchema: {
        type: "object",
        required: ["to", "subject"],
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  ],
});

export const calendarPack = definePack({
  key: "calendar",
  name: "Calendar",
  description: "Read the calendar and create or change events after a yes.",
  connection: "google",
  enabledByDefault: false,
  tools: [
    {
      name: "calendar.listEvents",
      classification: "READ",
      description: "List upcoming events.",
      inputSchema: { type: "object", properties: { calendarId: { type: "string" } } },
    },
    {
      name: "calendar.searchEvents",
      classification: "READ",
      description: "Search events.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
    {
      name: "calendar.checkAvailability",
      classification: "READ",
      description: "Check whether a time is free.",
      inputSchema: {
        type: "object",
        required: ["start", "end"],
        properties: { start: { type: "string" }, end: { type: "string" } },
      },
    },
    {
      name: "calendar.createEvent",
      classification: "EXTERNAL_WRITE",
      description: "Create an event.",
      inputSchema: {
        type: "object",
        required: ["title", "start"],
        properties: {
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
        },
      },
    },
    {
      name: "calendar.updateEvent",
      classification: "EXTERNAL_WRITE",
      description: "Update an event.",
      inputSchema: {
        type: "object",
        required: ["eventId"],
        properties: { eventId: { type: "string" }, title: { type: "string" } },
      },
    },
    {
      name: "calendar.deleteEvent",
      classification: "DESTRUCTIVE",
      description: "Cancel or delete an event.",
      inputSchema: {
        type: "object",
        required: ["eventId"],
        properties: { eventId: { type: "string" } },
      },
    },
  ],
});

export const LOTS_PACKS: readonly PackDefinition[] = [
  webResearchPack,
  githubPack,
  gmailPack,
  calendarPack,
];

export function packByKey(key: string): PackDefinition | undefined {
  return LOTS_PACKS.find((pack) => pack.key === key);
}

export function isPackKey(value: string): value is PackKey {
  return LOTS_PACKS.some((pack) => pack.key === value);
}
