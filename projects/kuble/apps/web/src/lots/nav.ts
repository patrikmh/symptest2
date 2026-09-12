import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarClock,
  Inbox,
  Monitor,
  Puzzle,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

export type LotsNavKey =
  | "inbox"
  | "agents"
  | "fyrar"
  | "approvals"
  | "packs"
  | "activity"
  | "computers"
  | "admin"
  | "settings";

export type LotsNavItem = {
  key: LotsNavKey;
  href: string;
  icon: LucideIcon;
  /** Second group in the desktop rail (spec §29): Computers, Admin, Settings. */
  secondary?: boolean;
  /** Shown in the mobile bottom bar; everything else lives under "More". */
  mobile?: boolean;
};

/** Spec §29 desktop order. Labels are translated where rendered. */
export const LOTS_NAV: readonly LotsNavItem[] = [
  { key: "inbox", href: "/app/inbox", icon: Inbox, mobile: true },
  { key: "agents", href: "/app/agents", icon: Users, mobile: true },
  { key: "fyrar", href: "/app/fyrar", icon: CalendarClock, mobile: true },
  { key: "approvals", href: "/app/approvals", icon: ShieldCheck },
  { key: "packs", href: "/app/packs", icon: Puzzle },
  { key: "activity", href: "/app/activity", icon: Activity },
  { key: "computers", href: "/app/computers", icon: Monitor, secondary: true },
  { key: "admin", href: "/app/admin", icon: UserCog, secondary: true },
  { key: "settings", href: "/app/agents?settings=general", icon: Settings, secondary: true },
];

/** Routes that render the upstream chat shell (an agent or a group conversation). */
const CHAT_PATH = /^\/app\/(g\/)?[^/]+$/;

/**
 * Which rail item is active for a path. Coworker and group chats belong to Coworkers; unknown
 * paths highlight nothing rather than guessing.
 */
export function activeNavKey(pathname: string): LotsNavKey | null {
  const direct = LOTS_NAV.find((item) => item.href.split("?")[0] === pathname);
  if (direct) return direct.key === "settings" ? "agents" : direct.key;
  if (pathname === "/app" || pathname === "/app/") return "agents";
  if (pathname.startsWith("/app/fyrar/")) return "fyrar";
  if (pathname.startsWith("/app/packs/")) return "packs";
  if (CHAT_PATH.test(pathname)) return "agents";
  return null;
}
