import { Trans } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { rpc } from "../lib/rpc";

/** Completes Google / GitHub OAuth and sends the person back to Tools. */
export function PackOAuthPage() {
  const [params] = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(true);
      return;
    }
    void rpc.lots.packs
      .complete({ code, state })
      .then((pack) => {
        window.location.replace(`/app/packs/${pack.key}`);
      })
      .catch(() => setError(true));
  }, [params]);

  if (!error) {
    return (
      <div className="grid h-full place-items-center text-[14px] text-muted-foreground">
        <Trans>Finishing the connection…</Trans>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="text-[15px] text-foreground/80">
        <Trans>That connection could not be finished.</Trans>
      </p>
      <Button
        variant="outline"
        className="mt-4"
        nativeButton={false}
        render={<Link to="/app/packs" />}
      >
        <Trans>Back to Tools</Trans>
      </Button>
    </div>
  );
}
