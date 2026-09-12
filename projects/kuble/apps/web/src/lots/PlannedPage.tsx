import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LotsNavKey } from "./nav";

type Planned = {
  title: string;
  description: ReactNode;
  next: ReactNode;
  href: string;
  cta: ReactNode;
};

/**
 * Sections whose pages arrive in later phases of docs/implementation-plan.md. Each renders an
 * honest empty state: what the page will do, and a useful next step that already works.
 */
export function PlannedPage({ section }: { section: Exclude<LotsNavKey, "agents" | "settings"> }) {
  const { t } = useLingui();
  const coworkers = "/app/agents";
  const settings = "/app/agents?settings=general";
  const planned: Record<typeof section, Planned> = {
    inbox: {
      title: t`Inbox`,
      description: t`Approvals that need you, finished Fyrar and notes from your coworkers will gather here.`,
      next: t`Until then, open a coworker — anything that needs you shows up in their chat.`,
      href: coworkers,
      cta: <Trans>Go to Coworkers</Trans>,
    },
    fyrar: {
      title: t`Fyrar`,
      description: t`A fyr is recurring work attached to a coworker — “every morning, summarise overnight email.”`,
      next: t`Open a coworker and ask them to repeat something on a schedule. Their chat panel already has schedules.`,
      href: coworkers,
      cta: <Trans>Pick a coworker</Trans>,
    },
    approvals: {
      title: t`Approvals`,
      description: t`When a coworker wants to send email, post or create something outside Ratatosk, they wait for a yes.`,
      next: t`Those questions already appear as cards inside the coworker's chat.`,
      href: coworkers,
      cta: <Trans>Go to Coworkers</Trans>,
    },
    packs: {
      title: t`Tools`,
      description: t`Web research, GitHub, Gmail and Calendar that your coworkers can use, once you connect them.`,
      next: t`Connections are managed under Settings for now.`,
      href: settings,
      cta: <Trans>Open settings</Trans>,
    },
    activity: {
      title: t`Activity`,
      description: t`A readable timeline of what your coworkers did, asked and were allowed to do.`,
      next: t`Each coworker's chat is the record of their work today.`,
      href: coworkers,
      cta: <Trans>Go to Coworkers</Trans>,
    },
    computers: {
      title: t`Computers`,
      description: t`The place each coworker works — shared with the team, or their own.`,
      next: t`You do not need to set this up. Every coworker already has a place to work.`,
      href: coworkers,
      cta: <Trans>Go to Coworkers</Trans>,
    },
    admin: {
      title: t`Admin`,
      description: t`Members, roles, tools and connections for this workspace.`,
      next: t`Invite people and manage connections from Settings for now.`,
      href: settings,
      cta: <Trans>Open settings</Trans>,
    },
  };
  const page = planned[section];
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{page.title}</h1>
      <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="max-w-[460px] rounded-3xl border border-border bg-card px-8 py-10 shadow-sm">
          <p className="text-[15px] leading-relaxed text-foreground/80">{page.description}</p>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{page.next}</p>
          <Button variant="outline" className="mt-6" render={<Link to={page.href} />}>
            {page.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
