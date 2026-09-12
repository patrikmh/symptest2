import { Trans, useLingui } from "@lingui/react/macro";
import { roleChangeDenial, roleFromSpaceMember } from "@lots/access";
import type { SpaceMember, SpaceMembersList, SpaceRole } from "@rakazo/contracts";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

type LoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; data: SpaceMembersList };

const ROLE_ORDER: SpaceRole[] = ["owner", "admin", "member"];

/** Members, roles and invitations for this workspace (spec §6, slice 2.3). */
export function AdminPage() {
  const { t } = useLingui();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<SpaceRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await rpc.lots.admin.members.list();
      setState({ kind: "ready", data });
    } catch (error) {
      const status = errorStatus(error);
      setState({ kind: status === 403 ? "forbidden" : "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    if (pending || state.kind !== "ready") return;
    setPending(true);
    setInviteError(null);
    try {
      await rpc.lots.admin.members.invite({ email: email.trim(), role: inviteRole });
      setEmail("");
      await load();
    } catch (error) {
      setInviteError(
        errorStatus(error) === 409
          ? t`That person is already invited or already a member.`
          : t`The invite could not be sent. Please try again.`,
      );
    } finally {
      setPending(false);
    }
  }

  async function changeRole(memberId: string, role: SpaceRole) {
    try {
      await rpc.lots.admin.members.updateRole({ memberId, role });
      await load();
    } catch (error) {
      setInviteError(
        errorMessage(error)?.includes("final Owner")
          ? t`There must be at least one owner.`
          : t`That role could not be changed.`,
      );
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-6 py-8 md:px-10"
      data-testid="lots-admin"
    >
      <h1 className="text-[26px] font-semibold tracking-tight">
        <Trans>Admin</Trans>
      </h1>
      <p className="mt-1 text-[14px] text-muted-foreground">
        <Trans>People in this workspace, and the role each of them has.</Trans>
      </p>

      <Tabs defaultValue="members" className="mt-8">
        <TabsList aria-label={t`Admin`}>
          <TabsTrigger value="members">
            <Trans>Members</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-6">
          {state.kind === "loading" ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-10 w-full max-w-xl" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : state.kind === "forbidden" ? (
            <p className="max-w-[460px] text-[15px] leading-relaxed text-foreground/80">
              <Trans>Ask an owner or admin if you need someone invited to this workspace.</Trans>
            </p>
          ) : state.kind === "error" ? (
            <div>
              <p className="text-[15px] text-foreground/80">
                <Trans>Members could not be loaded.</Trans>
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : (
            <MembersPanel
              data={state.data}
              email={email}
              inviteRole={inviteRole}
              inviteError={inviteError}
              pending={pending}
              onEmailChange={setEmail}
              onInviteRoleChange={setInviteRole}
              onInvite={() => void invite()}
              onRoleChange={(memberId, role) => void changeRole(memberId, role)}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function MembersPanel({
  data,
  email,
  inviteRole,
  inviteError,
  pending,
  onEmailChange,
  onInviteRoleChange,
  onInvite,
  onRoleChange,
}: {
  data: SpaceMembersList;
  email: string;
  inviteRole: SpaceRole;
  inviteError: string | null;
  pending: boolean;
  onEmailChange: (value: string) => void;
  onInviteRoleChange: (role: SpaceRole) => void;
  onInvite: () => void;
  onRoleChange: (memberId: string, role: SpaceRole) => void;
}) {
  const { t } = useLingui();
  const labels = useRoleLabels();
  const viewerRole = roleFromSpaceMember(data.viewerRole);
  const canInviteAdmin = viewerRole === "OWNER";

  return (
    <div className="max-w-3xl">
      <form
        className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-end"
        data-testid="lots-admin-invite"
        onSubmit={(event) => {
          event.preventDefault();
          onInvite();
        }}
      >
        <div className="min-w-0 flex-1 text-[13px] font-medium">
          <Trans>Email</Trans>
          <Input
            className="mt-1.5"
            type="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder={t`name@company.com`}
            autoComplete="email"
            aria-label={t`Email`}
          />
        </div>
        <div className="text-[13px] font-medium">
          <Trans>Role</Trans>
          <NativeSelect
            className="mt-1.5 w-full sm:w-[140px]"
            value={inviteRole}
            onChange={(event) => onInviteRoleChange(event.target.value as SpaceRole)}
            aria-label={t`Role`}
          >
            {ROLE_ORDER.filter((role) => role !== "owner" || canInviteAdmin).map((role) => (
              <NativeSelectOption
                key={role}
                value={role}
                disabled={role !== "member" && !canInviteAdmin}
              >
                {labels[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending || email.trim().length === 0}>
          <Trans>Invite</Trans>
        </Button>
      </form>
      {inviteError ? (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {inviteError}
        </p>
      ) : null}

      <ul
        className="mt-6 divide-y divide-border rounded-3xl border border-border bg-card"
        data-testid="lots-admin-members"
      >
        {data.members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            viewerRole={data.viewerRole}
            ownerCount={data.ownerCount}
            onRoleChange={onRoleChange}
          />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({
  member,
  viewerRole,
  ownerCount,
  onRoleChange,
}: {
  member: SpaceMember;
  viewerRole: SpaceRole;
  ownerCount: number;
  onRoleChange: (memberId: string, role: SpaceRole) => void;
}) {
  const { t } = useLingui();
  const labels = useRoleLabels();
  const invited = member.kind === "invitation";
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium">{member.name}</p>
        <p className="truncate text-[13px] text-muted-foreground">{member.email}</p>
      </div>
      <div className="flex items-center gap-3">
        {invited ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
            <Trans>Invited</Trans>
          </span>
        ) : null}
        {invited ? (
          <span className="text-[13px] text-muted-foreground">{labels[member.role]}</span>
        ) : (
          <NativeSelect
            aria-label={t`Role for ${member.name}`}
            value={member.role}
            onChange={(event) => onRoleChange(member.id, event.target.value as SpaceRole)}
            data-testid="lots-admin-role"
          >
            {ROLE_ORDER.map((role) => (
              <NativeSelectOption
                key={role}
                value={role}
                disabled={
                  roleChangeDenial({
                    actorRole: roleFromSpaceMember(viewerRole),
                    targetRole: roleFromSpaceMember(member.role),
                    nextRole: roleFromSpaceMember(role),
                    ownerCount,
                  }) !== null
                }
              >
                {labels[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </div>
    </li>
  );
}

function useRoleLabels(): Record<SpaceRole, string> {
  const { t } = useLingui();
  return {
    owner: t`Owner`,
    admin: t`Admin`,
    member: t`Member`,
  };
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "FORBIDDEN") return 403;
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "CONFLICT") return 409;
  }
  return undefined;
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
