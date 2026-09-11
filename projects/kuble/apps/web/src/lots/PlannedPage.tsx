import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LotsNavKey } from "./nav";

type Planned = {
  title: string;
  description: ReactNode;
  phase: number;
};

/**
 * Sections whose pages arrive in later phases of docs/implementation-plan.md. Each renders an
 * honest empty state: what the page will do, and where the same work lives today.
 */
export function PlannedPage({ section }: { section: Exclude<LotsNavKey, "agents" | "settings"> }) {
  const { t } = useLingui();
  const planned: Record<typeof section, Planned> = {
    inbox: {
      title: t`Inbox`,
      description: t`Approvals that need you, failed and finished Fyrar, and updates from your agents will gather here.`,
      phase: 4,
    },
    fyrar: {
      title: t`Fyrar`,
      description: t`Recurring work attached to an agent. Until this page lands, schedules live in each agent's chat panel.`,
      phase: 3,
    },
    approvals: {
      title: t`Approvals`,
      description: t`Sensitive actions such as sending email or creating issues wait here for a decision. Today they appear as cards inside the agent's chat.`,
      phase: 4,
    },
    packs: {
      title: t`Packs`,
      description: t`Web Research, GitHub, Gmail and Google Calendar as tool packs your agents can use. Connections are managed under Integrations for now.`,
      phase: 5,
    },
    activity: {
      title: t`Activity`,
      description: t`A readable timeline of what your agents did, asked and were allowed to do.`,
      phase: 8,
    },
    computers: {
      title: t`Computers`,
      description: t`The Docker computers your agents work on: status, active jobs and which agents use them.`,
      phase: 7,
    },
    admin: {
      title: t`Admin`,
      description: t`Members, roles, packs, connections and computers for this workspace.`,
      phase: 2,
    },
  };
  const page = planned[section];
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{page.title}</h1>
      <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="max-w-[440px] rounded-3xl border border-border bg-card px-8 py-10 shadow-sm">
          <p className="text-[15px] leading-relaxed text-foreground/80">{page.description}</p>
          <p className="mt-4 text-[13px] text-muted-foreground">
            <Trans>Not available yet — planned for phase {page.phase}.</Trans>
          </p>
          <Button variant="outline" className="mt-6" render={<Link to="/app/agents" />}>
            <Trans>Go to Agents</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
