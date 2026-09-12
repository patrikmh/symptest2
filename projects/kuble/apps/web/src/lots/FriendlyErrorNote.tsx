import { Trans } from "@lingui/react/macro";
import { lotsFriendlyError } from "@lots/core";
import { useState } from "react";

export function FriendlyErrorNote({ error }: { error: unknown }) {
  const friendly = lotsFriendlyError(error);
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="lots-friendly-error" className="text-center">
      <p className="text-[15px] text-foreground/80">{friendly.message}</p>
      {friendly.hint ? (
        <p className="mt-1 text-[13.5px] text-muted-foreground">{friendly.hint}</p>
      ) : null}
      {friendly.technical ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-[12.5px] text-muted-foreground underline"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <Trans>Hide technical details</Trans> : <Trans>Technical details</Trans>}
          </button>
          {open ? (
            <pre className="mt-2 overflow-x-auto rounded-xl bg-muted px-3 py-2 text-start text-[12px] text-muted-foreground">
              {friendly.technical}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
