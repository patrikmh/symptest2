export type MemoryMail = {
  id: string;
  to: string;
  subject: string;
  body: string;
};

export type MemoryIssue = {
  id: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  comments: Array<{ id: string; body: string }>;
};

export type MemoryEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
};

/** In-memory Gmail for idempotency / reconcile tests (no network). */
export function createMemoryGmail(seed: MemoryMail[] = []) {
  const sent = [...seed];
  let next = seed.length + 1;
  return {
    sent,
    send(input: { to: string; subject: string; body?: string }, fail?: "timeout") {
      const mail: MemoryMail = {
        id: `msg-${next}`,
        to: input.to,
        subject: input.subject,
        body: input.body ?? "",
      };
      next += 1;
      sent.push(mail);
      if (fail === "timeout") {
        throw Object.assign(new Error("gmail send timed out"), { code: "ETIMEDOUT" });
      }
      return mail;
    },
    findSent(input: { to?: string; subject?: string; body?: string }): MemoryMail | null {
      return (
        sent.find(
          (mail) =>
            (input.to === undefined || mail.to === input.to) &&
            (input.subject === undefined || mail.subject === input.subject) &&
            (input.body === undefined || mail.body === input.body),
        ) ?? null
      );
    },
  };
}

export function createMemoryGitHub(seed: MemoryIssue[] = []) {
  const issues = [...seed];
  let next = seed.length + 1;
  return {
    issues,
    createIssue(input: { repo: string; title: string; body?: string }) {
      const issue: MemoryIssue = {
        id: `issue-${next}`,
        repo: input.repo,
        number: next,
        title: input.title,
        body: input.body ?? "",
        comments: [],
      };
      next += 1;
      issues.push(issue);
      return issue;
    },
    comment(input: { repo: string; number: number; body: string }) {
      const issue = issues.find((row) => row.repo === input.repo && row.number === input.number);
      if (!issue) return null;
      const comment = { id: `c-${issue.comments.length + 1}`, body: input.body };
      issue.comments.push(comment);
      return { ...comment, repo: input.repo, number: input.number };
    },
    findIssue(input: { repo: string; title?: string; number?: number }) {
      return (
        issues.find(
          (row) =>
            row.repo === input.repo &&
            (input.number === undefined || row.number === input.number) &&
            (input.title === undefined || row.title === input.title),
        ) ?? null
      );
    },
    findComment(input: { repo: string; number: number; body: string }) {
      const issue = issues.find((row) => row.repo === input.repo && row.number === input.number);
      const comment = issue?.comments.find((row) => row.body === input.body);
      return comment ? { ...comment, repo: input.repo, number: input.number } : null;
    },
  };
}

export function createMemoryCalendar(seed: MemoryEvent[] = []) {
  const events = [...seed];
  let next = seed.length + 1;
  return {
    events,
    create(input: { title: string; start: string; end?: string }) {
      const event: MemoryEvent = {
        id: `evt-${next}`,
        title: input.title,
        start: input.start,
        end: input.end,
      };
      next += 1;
      events.push(event);
      return event;
    },
    find(input: { title?: string; start?: string }) {
      return (
        events.find(
          (row) =>
            (input.title === undefined || row.title === input.title) &&
            (input.start === undefined || row.start === input.start),
        ) ?? null
      );
    },
  };
}
