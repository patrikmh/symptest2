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
 * "New agent" (spec §31): pick a template, optionally rename, create the Rakazo bot and open
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
      setError(t`The agent could not be created. Please try again.`);
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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            <Trans>New agent</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Start from a template. You can change everything later.</Trans>
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">{t`Template`}</legend>
          {AGENT_TEMPLATES.map((item, index) => {
            const selected = item.key === templateKey;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setTemplateKey(item.key)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 text-start transition-colors",
                  selected
                    ? "border-foreground/60 bg-accent"
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
                  <span className="block text-[14px] font-medium">{item.name}</span>
                  <span className="block text-[12.5px] leading-snug text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="lots-new-agent-name">
            <Trans>Name</Trans>
          </Label>
          <Input
            id="lots-new-agent-name"
            value={name}
            placeholder={template.name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
          />
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
            {pending ? <Trans>Creating…</Trans> : <Trans>Create agent</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
