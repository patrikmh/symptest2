import { agentTemplate, FIRST_BOT_SPAWN_KEY } from "@lots/core";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import {
  createRepos,
  createThreadEvents,
  createThreadMessage,
  type PrismaClient,
} from "@rakazo/db";
import { createFyr } from "./fyrar.js";

export const DEMO_AGENT_KEYS = ["assistant", "researcher", "developer", "reviewer"] as const;
export type DemoAgentKey = (typeof DEMO_AGENT_KEYS)[number];

export function demoSpawnKey(key: DemoAgentKey): string {
  return key === "assistant" ? FIRST_BOT_SPAWN_KEY : `lots-demo:${key}`;
}

export const DEMO_FYRAR = [
  {
    key: "morning-brief",
    agent: "assistant",
    name: "Morning brief",
    cron: "0 8 * * *",
    instruction: agentTemplate("assistant").suggestedRoutine,
  },
  {
    key: "weekly-sources",
    agent: "researcher",
    name: "Weekly sources",
    cron: "0 9 * * 1",
    instruction: agentTemplate("researcher").suggestedRoutine,
  },
] as const;

export const DEMO_APPROVALS = [
  {
    key: "gmail-send",
    tool: "gmail.send",
    status: "intended",
    request: {
      to: "ada@example.com",
      subject: "Weekly brief",
      body: "Draft of this week's brief.",
    },
  },
  {
    key: "github-issue",
    tool: "github.createIssue",
    status: "completed",
    request: { repo: "acme/ratatosk", title: "Tidy the onboarding copy" },
  },
] as const;

export function demoEffectKey(key: (typeof DEMO_APPROVALS)[number]["key"]): string {
  return `lots-demo:approval:${key}`;
}

const silentJobs: JobPublisher = {
  enqueue: async () => undefined,
  cancel: async () => undefined,
  close: async () => undefined,
};

export type DemoSeedResult = {
  spaceId: string;
  userId: string;
  bots: Record<DemoAgentKey, string>;
  fyrar: string[];
  approvals: string[];
};

export async function seedDemo(
  prisma: PrismaClient,
  options: { jobs?: JobPublisher } = {},
): Promise<DemoSeedResult> {
  const member = await prisma.spaceMember.findFirst({
    orderBy: { createdAt: "asc" },
    select: { spaceId: true, userId: true },
  });
  if (!member) {
    throw new Error("Sign in once to create a workspace, then run pnpm seed:demo again.");
  }
  const user = await prisma.user.findUnique({
    where: { id: member.userId },
    select: { email: true },
  });
  const actor: Actor = {
    userId: member.userId,
    spaceId: member.spaceId,
    email: user?.email ?? "demo@ratatosk.local",
    isDeploymentOwner: true,
  };
  const repos = createRepos(prisma);
  const jobs = options.jobs ?? silentJobs;
  const bots = {} as Record<DemoAgentKey, string>;

  for (const key of DEMO_AGENT_KEYS) {
    const template = agentTemplate(key);
    const bot = await repos.createBot(actor, {
      name: template.name,
      title: template.role,
      description: template.description,
      instructions: template.instructions,
      notifyOnFinish: true,
      spawnKey: demoSpawnKey(key),
    });
    bots[key] = bot.id;
  }

  const fyrar: string[] = [];
  for (const fyr of DEMO_FYRAR) {
    const existing = await prisma.routine.findFirst({
      where: { spaceId: actor.spaceId, botId: bots[fyr.agent], name: fyr.name },
      select: { id: true },
    });
    if (existing) {
      fyrar.push(existing.id);
      continue;
    }
    const created = await createFyr(prisma, jobs, actor, "OWNER", {
      botId: bots[fyr.agent],
      name: fyr.name,
      instruction: fyr.instruction,
      crons: [fyr.cron],
      timezone: "UTC",
      enabled: true,
    });
    fyrar.push(created.id);
  }

  const assistant = await prisma.bot.findFirstOrThrow({
    where: { id: bots.assistant },
    include: { thread: true },
  });
  if (!assistant.thread) throw new Error("Demo Assistant is missing its thread.");

  const task = await ensureDemoTask(prisma, {
    spaceId: actor.spaceId,
    userId: actor.userId,
    botId: assistant.id,
    threadId: assistant.thread.id,
  });
  const run = await ensureDemoRun(prisma, {
    spaceId: actor.spaceId,
    userId: actor.userId,
    botId: assistant.id,
    threadId: assistant.thread.id,
    taskId: task.id,
  });

  const approvals: string[] = [];
  for (const approval of DEMO_APPROVALS) {
    const row = await prisma.externalEffect.upsert({
      where: { idempotencyKey: demoEffectKey(approval.key) },
      create: {
        spaceId: actor.spaceId,
        runId: run.id,
        kind: approval.tool,
        idempotencyKey: demoEffectKey(approval.key),
        status: approval.status,
        request: approval.request,
        result: approval.status === "completed" ? { ok: true, demo: true } : undefined,
      },
      update: {},
    });
    approvals.push(row.id);
  }

  const existingMessages = await prisma.message.count({ where: { threadId: assistant.thread.id } });
  if (existingMessages === 0) {
    await createThreadMessage(prisma, {
      threadId: assistant.thread.id,
      role: "user",
      blocks: [{ kind: "text", text: "Summarise what landed overnight." }],
    });
    await createThreadMessage(prisma, {
      threadId: assistant.thread.id,
      role: "bot",
      botId: assistant.id,
      runId: run.id,
      blocks: [
        {
          kind: "text",
          text: "Two notes: the morning brief fyr is ready, and a Gmail send is waiting for approval.",
        },
      ],
    });
    const events = createThreadEvents(prisma);
    await events.append({
      spaceId: actor.spaceId,
      threadId: assistant.thread.id,
      botId: assistant.id,
      runId: run.id,
      type: "run.completed",
      payload: {},
    });
  }

  return {
    spaceId: actor.spaceId,
    userId: actor.userId,
    bots,
    fyrar,
    approvals,
  };
}

async function ensureDemoTask(
  prisma: PrismaClient,
  input: { spaceId: string; userId: string; botId: string; threadId: string },
) {
  const existing = await prisma.task.findFirst({
    where: { spaceId: input.spaceId, botId: input.botId, prompt: "lots-demo:activity" },
  });
  if (existing) return existing;
  return prisma.task.create({
    data: {
      spaceId: input.spaceId,
      userId: input.userId,
      botId: input.botId,
      threadId: input.threadId,
      prompt: "lots-demo:activity",
      status: "completed",
    },
  });
}

async function ensureDemoRun(
  prisma: PrismaClient,
  input: {
    spaceId: string;
    userId: string;
    botId: string;
    threadId: string;
    taskId: string;
  },
) {
  const existing = await prisma.run.findFirst({
    where: { taskId: input.taskId, trigger: "user" },
  });
  if (existing) return existing;
  return prisma.run.create({
    data: {
      spaceId: input.spaceId,
      userId: input.userId,
      botId: input.botId,
      threadId: input.threadId,
      taskId: input.taskId,
      status: "completed",
      trigger: "user",
      completedAt: new Date(),
    },
  });
}
