import { Trans, useLingui } from "@lingui/react/macro";
import type { PendingInvitation } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { rpc, selectSpace } from "../lib/rpc";

/** Pending workspace invites for the signed-in email (spec §6). */
export function InviteBanner() {
  const { t } = useLingui();
  const [invites, setInvites] = useState<PendingInvitation[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await rpc.lots.invitations.list());
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(invite: PendingInvitation) {
    if (pendingId) return;
    setPendingId(invite.id);
    setError(null);
    try {
      const result = await rpc.lots.invitations.accept({ invitationId: invite.id });
      selectSpace(result.spaceId);
      window.location.assign("/app/agents");
    } catch {
      setError(t`That invite could not be accepted.`);
      setPendingId(null);
    }
  }

  async function decline(invite: PendingInvitation) {
    if (pendingId) return;
    setPendingId(invite.id);
    setError(null);
    try {
      await rpc.lots.invitations.decline({ invitationId: invite.id });
      setInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch {
      setError(t`That invite could not be declined.`);
    } finally {
      setPendingId(null);
    }
  }

  if (invites.length === 0 && !error) return null;

  return (
    <div className="space-y-2 px-4 pt-4 md:px-6" data-testid="lots-invite-banner">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[14px] leading-relaxed text-foreground/90">
            <Trans>
              {invite.inviterName} invited you to {invite.organizationName}.
            </Trans>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              disabled={pendingId !== null}
              onClick={() => void decline(invite)}
            >
              <Trans>Not now</Trans>
            </Button>
            <Button disabled={pendingId !== null} onClick={() => void accept(invite)}>
              <Trans>Join</Trans>
            </Button>
          </div>
        </div>
      ))}
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
