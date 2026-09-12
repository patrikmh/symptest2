# Ratatosk — product language

Ratatosk is the product name. In Norse myth Ratatosk is the squirrel that
runs the length of Yggdrasil, carrying messages between the eagle in the
crown and the dragon at the roots. The name is the whole workspace: a tree
of coworkers, each an aspect that can be sent out and that reports back.

The original specification still says **LOTS**. That document is kept as
[`LOTS_MVP_SPEC.md`](../LOTS_MVP_SPEC.md). Code identifiers (`@lots/core`,
`apps/web/src/lots/`, avatar style `"lots"`) stay as they are so upstream
Rakazo pulls stay small. Only user-facing copy uses Ratatosk.

## What people see

| English | Swedish | What it is |
| --- | --- | --- |
| Coworker | Medarbetare | A persistent AI you chat with and can give work to (Rakazo *bot*, spec *agent*) |
| Fyr | Fyr | Recurring work attached to a coworker (Rakazo *routine*) |
| Tool | Verktyg | A connected capability such as Gmail or GitHub (spec *pack*) |
| Approval | Godkännande | A yes/no before something leaves the workspace |
| Shared computer / Own computer | Delad dator / Egen dator | Where the coworker works (Rakazo *team* / *dedicated* computer) |
| Kublet | Kublet | The pastel square face on each coworker — visual only |

Infrastructure words (agent, bot, pack, Docker, sandbox) stay out of the
UI. Statuses are **Ready**, **Working**, **Needs you**, **Failed**
(Swedish: Redo, Jobbar, Behöver dig, Misslyckades).

Swedish is a first-class UI locale (`sv`). Untranslated strings fall back
to the English source message.
