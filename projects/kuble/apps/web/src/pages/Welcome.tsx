import { Trans } from "@lingui/react/macro";
import { BOT_COLORS } from "@rakazo/contracts";
import { BotAvatar } from "@rakazo/ui-web";
import { useNavigate } from "react-router-dom";
import { WindowChrome } from "./WindowChrome";

export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-background" data-rakazo-surface="welcome">
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-11 pb-[90px]">
        <div className="flex items-center gap-[26px]">
          <BotAvatar color={BOT_COLORS[2]} identity="lots" size={88} variant="lots" />
          <div className="text-[76px] font-semibold leading-none tracking-[-0.03em] text-foreground">
            LOTS
          </div>
        </div>
        <p className="max-w-[600px] text-center text-[27px] leading-[1.4] text-foreground/75">
          <Trans>
            Persistent AI coworkers
            <br />
            you can give real work to.
          </Trans>
        </p>
        <button
          type="button"
          onClick={() => navigate("/sign-up")}
          className="app-no-drag rounded-full bg-accent px-[34px] py-[15px] text-[19px] text-foreground transition hover:scale-[1.04] hover:bg-accent"
        >
          <Trans>Sign up</Trans>&nbsp;&nbsp;→
        </button>
      </div>
    </div>
  );
}
