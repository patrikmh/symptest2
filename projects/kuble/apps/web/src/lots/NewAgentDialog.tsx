import { Trans, useLingui } from "@lingui/react/macro";
import { AGENT_TEMPLATES, type AgentTemplate } from "@lots/core";
import { BOT_COLORS } from "@rakazo/contracts";
import {
  BotAvatar,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@rakazo/ui-web";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rpc } from "../lib/rpc";

/**
 * "New coworker" (spec §31): pick a template, optionally rename, create the Rakazo bot and open
 * its chat. Templates only pre-fill the profile; everything else is editable in the chat panel.
 */
export function NewAgentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [templateKey, setTemplateKey] = useState<AgentTemplate["key"]>("assistant");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = AGENT_TEMPLATES.find((item) => item.key === templateKey) ?? AGENT_TEMPLATES[0]!;
  const copies = useTemplateCopy();
  const copy = copies[templateKey];

  function reset() {
    setTemplateKey("assistant");
    setName("");
    setError(null);
    setPending(false);
  }

  async function create() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const bot = await rpc.bots.create({
        name: name.trim() || template.name,
        title: template.role,
        description: template.description,
        instructions: template.instructions,
        notifyOnFinish: true,
        computerMode: "team",
      });
      onCreated?.();
      onOpenChange(false);
      reset();
      navigate(`/app/${bot.id}`);
    } catch {
      setError(t`The coworker could not be created. Please try again.`);
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            <Trans>New coworker</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Pick a starting point. You can change the name, role and tools later.</Trans>
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">{t`Starting point`}</legend>
          {AGENT_TEMPLATES.map((item, index) => {
            const selected = item.key === templateKey;
            const labels = copies[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setTemplateKey(item.key)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 text-start transition-colors",
                  selected
                    ? "border-foreground/60 bg-accent shadow-sm"
                    : "border-border bg-card hover:bg-accent/50",
                )}
              >
                <BotAvatar
                  color={BOT_COLORS[index % BOT_COLORS.length] ?? BOT_COLORS[0]}
                  identity={item.key}
                  size={34}
                  variant="lots"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{labels.name}</span>
                  <span className="block text-[12.5px] leading-snug text-muted-foreground">
                    {labels.description}
                  </span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Trans>A fyr they could run</Trans>
          </p>
          <p className="mt-1 text-[13.5px] leading-snug text-foreground/85">{copy.routine}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lots-new-agent-name">
            <Trans>Name</Trans>
          </Label>
          <Input
            id="lots-new-agent-name"
            value={name}
            placeholder={copy.name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
          />
          <p className="text-[12px] text-muted-foreground">
            <Trans>Leave blank to use the suggested name.</Trans>
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={() => void create()} disabled={pending} data-testid="lots-create-agent">
            {pending ? <Trans>Creating…</Trans> : <Trans>Add coworker</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useTemplateCopy(): Record<
  AgentTemplate["key"],
  { name: string; description: string; routine: string }
> {
  const { t } = useLingui();
  return {
    assistant: {
      name: t`Assistant`,
      description: t`Helps with research, writing and keeping things organized.`,
      routine: t`Every morning, summarise what came in overnight.`,
    },
    researcher: {
      name: t`Researcher`,
      description: t`Finds, reads and summarizes sources with citations.`,
      routine: t`Every Monday, brief me on this week's news in my field.`,
    },
    developer: {
      name: t`Developer`,
      description: t`Reads code and issues, then drafts a clear change.`,
      routine: t`Every weekday morning, list new issues on the repo.`,
    },
    "sales-scout": {
      name: t`Sales Scout`,
      description: t`Looks for companies and people that match a profile.`,
      routine: t`Every morning, find five companies that match the profile.`,
    },
    reviewer: {
      name: t`Reviewer`,
      description: t`Reads someone else's draft and gives structured feedback.`,
      routine: t`When another coworker finishes a draft, review it.`,
    },
  };
}
