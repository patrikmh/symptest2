import type { PackExecuteContext } from "./define-pack.js";
import {
  numberArg,
  PackProviderError,
  packFetch,
  pickFields,
  requireAccessToken,
  stringArg,
} from "./http.js";

function repoParts(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) {
    throw new PackProviderError("Repository must look like owner/name.", "bad_request");
  }
  return { owner, name };
}

function issueFields(value: unknown) {
  return (
    pickFields(value, ["id", "number", "title", "body", "html_url", "state"]) ?? {
      error: "empty",
    }
  );
}

export async function executeGithubTool(
  name: string,
  args: Record<string, unknown>,
  context: PackExecuteContext = {},
): Promise<Record<string, unknown>> {
  const token = requireAccessToken(context.accessToken);
  const request = {
    accessToken: token,
    signal: context.signal,
    fetchImpl: context.fetchImpl,
  };
  const repo = stringArg(args, "repo");
  switch (name) {
    case "github.listRepos":
    case "github_listRepos": {
      const { json } = await packFetch({
        ...request,
        url: "https://api.github.com/user/repos?per_page=30&sort=updated",
        accept: "application/vnd.github+json",
      });
      const items = Array.isArray(json) ? json : [];
      return {
        repos: items
          .map((item) => pickFields(item, ["full_name", "html_url", "description", "private"]))
          .filter((item): item is Record<string, unknown> => item !== null),
      };
    }
    case "github.searchRepos":
    case "github_searchRepos": {
      const query = stringArg(args, "query") || stringArg(args, "value");
      const { json } = await packFetch({
        ...request,
        url: `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}`,
        accept: "application/vnd.github+json",
      });
      const items = Array.isArray((json as { items?: unknown }).items)
        ? ((json as { items: unknown[] }).items ?? [])
        : [];
      return {
        repos: items
          .map((item) => pickFields(item, ["full_name", "html_url", "description"]))
          .filter((item): item is Record<string, unknown> => item !== null),
      };
    }
    case "github.listIssues":
    case "github_listIssues": {
      const { owner, name: repoName } = repoParts(repo);
      const { json } = await packFetch({
        ...request,
        url: `https://api.github.com/repos/${owner}/${repoName}/issues?state=open&per_page=20`,
        accept: "application/vnd.github+json",
      });
      const items = Array.isArray(json) ? json : [];
      return { issues: items.map(issueFields) };
    }
    case "github.readIssue":
    case "github_readIssue": {
      const { owner, name: repoName } = repoParts(repo);
      const number = numberArg(args, "number");
      if (number == null) throw new PackProviderError("Issue number is required.", "bad_request");
      const { json } = await packFetch({
        ...request,
        url: `https://api.github.com/repos/${owner}/${repoName}/issues/${number}`,
        accept: "application/vnd.github+json",
      });
      return issueFields(json);
    }
    case "github.listPulls":
    case "github_listPulls": {
      const { owner, name: repoName } = repoParts(repo);
      const { json } = await packFetch({
        ...request,
        url: `https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=20`,
        accept: "application/vnd.github+json",
      });
      const items = Array.isArray(json) ? json : [];
      return {
        pulls: items.map(
          (item) => pickFields(item, ["id", "number", "title", "html_url", "state"]) ?? {},
        ),
      };
    }
    case "github.readPull":
    case "github_readPull": {
      const { owner, name: repoName } = repoParts(repo);
      const number = numberArg(args, "number");
      if (number == null) throw new PackProviderError("Pull number is required.", "bad_request");
      const { json } = await packFetch({
        ...request,
        url: `https://api.github.com/repos/${owner}/${repoName}/pulls/${number}`,
        accept: "application/vnd.github+json",
      });
      return pickFields(json, ["id", "number", "title", "body", "html_url", "state"]) ?? {};
    }
    case "github.createIssue":
    case "github_createIssue": {
      const { owner, name: repoName } = repoParts(repo);
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: `https://api.github.com/repos/${owner}/${repoName}/issues`,
        accept: "application/vnd.github+json",
        body: JSON.stringify({
          title: stringArg(args, "title"),
          body: stringArg(args, "body"),
        }),
      });
      return issueFields(json);
    }
    case "github.commentIssue":
    case "github_commentIssue":
    case "github.commentPull":
    case "github_commentPull": {
      const { owner, name: repoName } = repoParts(repo);
      const number = numberArg(args, "number");
      if (number == null) throw new PackProviderError("Number is required.", "bad_request");
      const { json } = await packFetch({
        ...request,
        method: "POST",
        url: `https://api.github.com/repos/${owner}/${repoName}/issues/${number}/comments`,
        accept: "application/vnd.github+json",
        body: JSON.stringify({ body: stringArg(args, "body") }),
      });
      return pickFields(json, ["id", "body", "html_url"]) ?? {};
    }
    case "github.mergePull":
    case "github_mergePull": {
      const { owner, name: repoName } = repoParts(repo);
      const number = numberArg(args, "number");
      if (number == null) throw new PackProviderError("Pull number is required.", "bad_request");
      const { json } = await packFetch({
        ...request,
        method: "PUT",
        url: `https://api.github.com/repos/${owner}/${repoName}/pulls/${number}/merge`,
        accept: "application/vnd.github+json",
        body: JSON.stringify({ merge_method: "merge" }),
      });
      return pickFields(json, ["merged", "sha", "message"]) ?? {};
    }
    default:
      throw new PackProviderError("Unknown GitHub tool.", "bad_request");
  }
}

export async function findGithubWrite(
  tool: string,
  request: Record<string, unknown>,
  context: PackExecuteContext,
): Promise<Record<string, unknown> | null> {
  const token = context.accessToken;
  if (!token) return null;
  const repo = stringArg(request, "repo");
  if (!repo) return null;
  try {
    if (tool.includes("createIssue")) {
      const listed = await executeGithubTool("github.listIssues", { repo }, context);
      const issues = Array.isArray(listed.issues) ? listed.issues : [];
      const title = stringArg(request, "title");
      const found = issues.find(
        (item) =>
          item &&
          typeof item === "object" &&
          "title" in item &&
          String((item as { title?: unknown }).title) === title,
      );
      return found && typeof found === "object" ? (found as Record<string, unknown>) : null;
    }
    if (tool.includes("comment")) {
      const { owner, name } = repoParts(repo);
      const number = numberArg(request, "number");
      if (number == null) return null;
      const { json } = await packFetch({
        accessToken: token,
        signal: context.signal,
        fetchImpl: context.fetchImpl,
        url: `https://api.github.com/repos/${owner}/${name}/issues/${number}/comments?per_page=30`,
        accept: "application/vnd.github+json",
      });
      const items = Array.isArray(json) ? json : [];
      const body = stringArg(request, "body");
      const found = items.find(
        (item) =>
          item &&
          typeof item === "object" &&
          "body" in item &&
          String((item as { body?: unknown }).body) === body,
      );
      return found ? (pickFields(found, ["id", "body", "html_url"]) ?? null) : null;
    }
  } catch {
    return null;
  }
  return null;
}
