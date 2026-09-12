import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Fyr } from "@rakazo/contracts";
import { type CronFreq, cronFromPreset, defaultCronPreset, presetFromCron } from "@rakazo/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Textarea,
} from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const FREQS: CronFreq[] = ["Every day", "Weekdays", "Every week", "Every hour"];

const TIMES = ["7:00 AM", "8:00 AM", "9:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function cronsFromDraft(freq: CronFreq, time: string): string[] {
  return [cronFromPreset({ ...defaultCronPreset(), freq, time })];
}

/**
 * Create or edit a Fyr (spec §32): a repeating job attached to a coworker.
 * One-shot `@once` schedules stay in chat — this dialog only creates recurring fyrar.
 */
export function NewFyrDialog({
  open,
  onOpenChange,
  bots,
  fyr,
  defaultBotId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bots: Bot[];
  fyr?: Fyr | null;
  defaultBotId?: string;
  onSaved?: (fyr: Fyr) => void;
}) {
  const { t } = useLingui();
  const [botId, setBotId] = useState(defaultBotId ?? bots[0]?.id ?? "");
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [freq, setFreq] = useState<CronFreq>("Every day");
  const [time, setTime] = useState("9:00 AM");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBotId(fyr?.botId ?? defaultBotId ?? bots[0]?.id ?? "");
    setName(fyr?.name ?? "");
    setInstruction(fyr?.instruction ?? "");
    setTimezone(fyr?.timezone ?? browserTimezone());
    const preset = fyr?.crons[0] ? presetFromCron(fyr.crons[0]) : defaultCronPreset();
    setFreq(FREQS.includes(preset.freq) ? preset.freq : "Every day");
    setTime(preset.time);
    setScheduleTouched(false);
    setError(null);
    setPending(false);
  }, [open, fyr, defaultBotId, bots]);

  const timed = freq !== "Every hour";
  const editing = Boolean(fyr);

  async function save() {
    if (pending) return;
    if (!botId) {
      setError(t`Pick a coworker first.`);
      return;
    }
    if (!name.trim() || !instruction.trim()) {
      setError(t`Give the fyr a name and what it should do.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const crons = cronsFromDraft(freq, time);
      const saved = fyr
        ? await rpc.lots.fyrar.update({
            fyrId: fyr.id,
            name: name.trim(),
            instruction: instruction.trim(),
            ...(scheduleTouched ? { crons } : {}),
            timezone,
            enabled: fyr.enabled,
          })
        : await rpc.lots.fyrar.create({
            botId,
            name: name.trim(),
            instruction: instruction.trim(),
            crons,
            timezone,
            enabled: true,
          });
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      setError(
        editing
          ? t`The fyr could not be saved. Please try again.`
          : t`The fyr could not be created. Please try again.`,
      );
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="lots-new-fyr">
        <DialogHeader>
          <DialogTitle>{editing ? <Trans>Edit fyr</Trans> : <Trans>Create Fyr</Trans>}</DialogTitle>
          <DialogDescription>
            <Trans>Recurring work attached to a coworker — they will do it on this schedule.</Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {!editing ? (
            <div className="grid gap-2">
              <Label htmlFor="lots-fyr-bot">
                <Trans>Coworker</Trans>
              </Label>
              <NativeSelect
                id="lots-fyr-bot"
                className="w-full"
                value={botId}
                onChange={(event) => setBotId(event.currentTarget.value)}
              >
                {bots.length === 0 ? (
                  <NativeSelectOption value="">{t`No coworkers yet`}</NativeSelectOption>
                ) : (
                  bots.map((bot) => (
                    <NativeSelectOption key={bot.id} value={bot.id}>
                      {bot.name}
                    </NativeSelectOption>
                  ))
                )}
              </NativeSelect>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="lots-fyr-name">
              <Trans>Name</Trans>
            </Label>
            <Input
              id="lots-fyr-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder={t`Morning brief`}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lots-fyr-instruction">
              <Trans>What should they do</Trans>
            </Label>
            <Textarea
              id="lots-fyr-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.currentTarget.value)}
              rows={4}
              placeholder={t`Summarise overnight email and leave the notes here.`}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="lots-fyr-freq">
                <Trans>Schedule</Trans>
              </Label>
              <NativeSelect
                id="lots-fyr-freq"
                className="w-full"
                value={freq}
                onChange={(event) => {
                  setFreq(event.currentTarget.value as CronFreq);
                  setScheduleTouched(true);
                }}
              >
                {FREQS.map((item) => (
                  <NativeSelectOption key={item} value={item}>
                    {item === "Every day"
                      ? t`Every day`
                      : item === "Weekdays"
                        ? t`Weekdays`
                        : item === "Every week"
                          ? t`Every week`
                          : t`Every hour`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {timed ? (
              <div className="grid gap-2">
                <Label htmlFor="lots-fyr-time">
                  <Trans>Time</Trans>
                </Label>
                <NativeSelect
                  id="lots-fyr-time"
                  className="w-full"
                  value={time}
                  onChange={(event) => {
                    setTime(event.currentTarget.value);
                    setScheduleTouched(true);
                  }}
                >
                  {TIMES.map((item) => (
                    <NativeSelectOption key={item} value={item}>
                      {item}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lots-fyr-tz">
              <Trans>Timezone</Trans>
            </Label>
            <Input
              id="lots-fyr-tz"
              value={timezone}
              onChange={(event) => setTimezone(event.currentTarget.value)}
            />
          </div>

          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={() => void save()} disabled={pending || (!editing && bots.length === 0)}>
            {pending ? (
              <Trans>Saving…</Trans>
            ) : editing ? (
              <Trans>Save</Trans>
            ) : (
              <Trans>Create Fyr</Trans>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
