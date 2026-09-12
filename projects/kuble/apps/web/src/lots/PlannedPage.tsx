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
export function PlannedPage({
  section,
}: {
  section: Exclude<
    LotsNavKey,
    "agents" | "settings" | "admin" | "fyrar" | "approvals" | "inbox" | "packs"
  >;
}) {
  const { t } = useLingui();
  const coworkers = "/app/agents";
  const planned: Record<typeof section, Planned> = {
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
  };
  const page = planned[section];
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{page.title}</h1>
      <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="max-w-[460px] rounded-3xl border border-border bg-card px-8 py-10 shadow-sm">
          <p className="text-[15px] leading-relaxed text-foreground/80">{page.description}</p>
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{page.next}</p>
          <Button
            variant="outline"
            className="mt-6"
            nativeButton={false}
            render={<Link to={page.href} />}
          >
            {page.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
