export type WebSource = {
  content: string;
  title: string;
  url: string;
  timestamp: string;
};

export function webSource(
  input: { content?: string; title?: string; url: string; timestamp?: string },
  now = new Date(),
): WebSource {
  return {
    content: (input.content ?? "").trim(),
    title: (input.title ?? "").trim() || input.url,
    url: input.url,
    timestamp: input.timestamp ?? now.toISOString(),
  };
}

/** Pull the readable text a coworker can quote. */
export function webExtract(
  page: { text?: string; title?: string; url: string },
  now = new Date(),
): WebSource {
  return webSource({ content: page.text ?? "", title: page.title, url: page.url }, now);
}

/** First sentences of a page — enough to decide whether to fetch more. */
export function webSummarize(
  page: { text?: string; title?: string; url: string },
  maxSentences = 3,
  now = new Date(),
): WebSource {
  const extracted = webExtract(page, now);
  const sentences = extracted.content
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    ...extracted,
    content: sentences.slice(0, Math.max(1, maxSentences)).join(" "),
  };
}
