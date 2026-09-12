# Architecture

Ratatosk is a product layer on [Rakazo](https://github.com/elie222/rakazo).
Rakazo owns the agent runtime (Pi), conversations, memory, routines,
Graphile Worker, Docker computers, and connectors. Ratatosk adds the
navigation, vocabulary, access rules, Fyrar/Approvals/Tools/Activity
surfaces, pack catalog, and installer wrapper.

```text
browser  →  web (Vite)  →  API (Hono + oRPC)
                              │
                     Postgres + Graphile Worker
                              │
                     Docker computer supervisor
```

## Ground rule

`reuse > adapt > extend > rewrite`. LOTS-owned code lives in
`packages/lots-*`, `apps/web/src/lots/`, `apps/api/src/lots/`, and
`infra/install/`. Upstream files are edited only at listed integration
points. `packages/adapters` must not import `@lots/*`.

## Mapping

| People say | Code says | Stored as |
| --- | --- | --- |
| Coworker | bot / agent | `Bot` |
| Fyr | routine | `Routine` |
| Tool | pack | `CapabilityInstall` (`kind: lots-pack`) + `Connection` |
| Approval | external write | `ExternalEffect` |
| Team | LotsTeam | `CapabilityInstall` (`kind: lots-team`) |
| Activity | timeline | `Event` |
| Computer | computer | `Computer` (team / dedicated) |

See [`upstream-map.md`](./upstream-map.md) for every spec section.

## Definition of Done (spec §57)

| Check | Status |
| --- | --- |
| Fresh install / update | Installer exists; Compose acceptance needs Docker |
| Login, org, roles | Rakazo auth + `@lots/access` + invitation accept |
| Agents and chat persist | Unchanged Rakazo bots/threads |
| Memory, Docker computer | Unchanged Rakazo |
| Fyrar, approvals, packs | Phases 3–5 |
| Idempotent / UNKNOWN writes | Phase 6 + Phase 10 live HTTP execute / reconcile lookup |
| Credentials stay out of model/logs | Upstream redaction + LOTS key-name redaction |
| Activity visible | `/app/activity` |
| Tests | LOTS unit tests + root `kuble` workflow |
