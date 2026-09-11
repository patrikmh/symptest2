import { useLingui } from "@lingui/react/macro";
import { BOT_COLORS } from "@rakazo/contracts";
import { BotAvatar, cn } from "@rakazo/ui-web";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { activeNavKey, LOTS_NAV, type LotsNavItem, type LotsNavKey } from "./nav";

/**
 * Persistent LOTS navigation (spec §29): a left rail on desktop, a bottom bar on mobile.
 * Pages render inside; the upstream chat shell keeps its own bot sidebar as the second column.
 */
export function LotsFrame({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const location = useLocation();
  const active = activeNavKey(location.pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [location.pathname]);

  const labels: Record<LotsNavKey, string> = {
    inbox: t`Inbox`,
    agents: t`Agents`,
    fyrar: t`Fyrar`,
    approvals: t`Approvals`,
    packs: t`Packs`,
    activity: t`Activity`,
    computers: t`Computers`,
    admin: t`Admin`,
    settings: t`Settings`,
  };
  const primary = LOTS_NAV.filter((item) => !item.secondary);
  const secondary = LOTS_NAV.filter((item) => item.secondary);
  const mobileItems = LOTS_NAV.filter((item) => item.mobile);
  const moreItems = LOTS_NAV.filter((item) => !item.mobile);

  return (
    <div className="flex h-full min-w-0 bg-background text-foreground" data-testid="lots-frame">
      <nav
        aria-label={t`Main`}
        className="hidden w-[76px] shrink-0 flex-col items-stretch border-e border-sidebar-border bg-sidebar px-2 pb-4 pt-5 md:flex xl:w-[212px]"
      >
        <Link
          to="/app/agents"
          className="mb-6 flex items-center gap-3 rounded-2xl px-2 py-1 xl:px-3"
          aria-label="LOTS"
        >
          <LotsMark />
          <span className="hidden text-[19px] font-semibold tracking-tight xl:inline">LOTS</span>
        </Link>
        <ul className="flex flex-col gap-1">
          {primary.map((item) => (
            <RailItem key={item.key} item={item} label={labels[item.key]} active={active} />
          ))}
        </ul>
        <div className="my-4 mx-3 border-t border-sidebar-border" />
        <ul className="flex flex-col gap-1">
          {secondary.map((item) => (
            <RailItem key={item.key} item={item} label={labels[item.key]} active={active} />
          ))}
        </ul>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col pb-[60px] md:pb-0">{children}</div>

      <nav
        aria-label={t`Main`}
        className="absolute inset-x-0 bottom-0 z-40 flex h-[60px] items-stretch justify-around border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden"
      >
        {mobileItems.map((item) => (
          <MobileItem key={item.key} item={item} label={labels[item.key]} active={active} />
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
            moreOpen ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal size={20} strokeWidth={1.8} aria-hidden="true" />
          {t`More`}
        </button>
      </nav>
      {moreOpen ? (
        <div className="absolute inset-x-3 bottom-[68px] z-50 rounded-2xl border border-border bg-card p-2 shadow-lg md:hidden">
          <ul className="grid grid-cols-2 gap-1">
            {moreItems.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px]",
                    active === item.key ? "bg-accent text-foreground" : "text-foreground/80",
                  )}
                >
                  <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  {labels[item.key]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RailItem({
  item,
  label,
  active,
}: {
  item: LotsNavItem;
  label: string;
  active: LotsNavKey | null;
}) {
  const isActive = active === item.key;
  return (
    <li>
      <Link
        to={item.href}
        aria-current={isActive ? "page" : undefined}
        title={label}
        className={cn(
          "flex items-center justify-center gap-3 rounded-2xl px-2 py-2.5 text-[14px] transition-colors xl:justify-start xl:px-3",
          isActive
            ? "bg-sidebar-accent text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <item.icon size={19} strokeWidth={1.8} aria-hidden="true" />
        <span className="hidden xl:inline">{label}</span>
      </Link>
    </li>
  );
}

function MobileItem({
  item,
  label,
  active,
}: {
  item: LotsNavItem;
  label: string;
  active: LotsNavKey | null;
}) {
  const isActive = active === item.key;
  return (
    <Link
      to={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </Link>
  );
}

/** Brand mark: the same pastel square agents wear, in the third palette colour. */
export function LotsMark({ size = 30 }: { size?: number }) {
  return <BotAvatar color={BOT_COLORS[2]} identity="lots" size={size} variant="lots" />;
}
