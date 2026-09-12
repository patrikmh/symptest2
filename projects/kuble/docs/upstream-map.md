# Upstream map: LOTS MVP requirements vs. Rakazo

This document maps every major requirement in [`LOTS_MVP_SPEC.md`](../LOTS_MVP_SPEC.md)
to what the vendored Rakazo code already provides. It is the Phase 0 deliverable
required by spec §51 and must be kept current when upstream is pulled.

- Upstream: <https://github.com/elie222/rakazo> (Apache-2.0)
- Imported as a squashed `git subtree` at `projects/kuble/`
- Upstream commit at import: `52e9aa2a7dc42a5bc8051fb35e992777eaeb8f82` (2026-09-11)
- Update with: `git subtree pull --prefix=projects/kuble https://github.com/elie222/rakazo.git main --squash`

Classification legend:

| Tag | Meaning |
| --- | --- |
| **EXISTS** | Rakazo already does this; LOTS uses it as-is (possibly with UI copy/naming changes only). |
| **ADAPTER** | Rakazo has the primitive; LOTS adds a thin layer (a query, a mapping, a Graphile task, a UI page over an existing RPC). |
| **NEW** | No upstream equivalent; LOTS code is required. |

The sections below follow the spec numbering.

---

## Vocabulary mapping

LOTS uses product words; Rakazo uses its own. Nothing is renamed in upstream code.
The mapping is applied at the LOTS UI/RPC boundary only.

| LOTS term | Rakazo concept | Where |
| --- | --- | --- |
| Organization / workspace | `Space` (the real authorization boundary; `Organization` is Better Auth's container and each user gets a personal org+space on bootstrap) | `packages/db/prisma/schema.prisma`, `packages/db/src/bootstrap-user.ts` |
| Agent | `Bot` | `packages/db/src/repos.ts` |
| Agent chat | `Thread` (one per bot) + `Message` + `Event` | `packages/db/src/events.ts` |
| Fyr (plural Fyrar) | `Routine` | `apps/api/src/router.ts` (`routines.*`), `packages/adapters/src/executor.ts` (`wakeRoutine`) |
| Fyr run | `Run` with `trigger: "routine"` | `packages/contracts/src/ids.ts` |
| Approval | `ExternalEffect` (+ `ask` message block) gated by `ActionApprovalRule` | `packages/adapters/src/approval-effect.ts`, `packages/core/src/action-approval.ts` |
| Pack | `ConnectorProvider` (tool source) | `packages/adapter-kit/src/interfaces.ts` |
| Connection | `Connection` (+ `Secret`) | `schema.prisma` |
| Computer | `Computer` (`scope: "team" \| "dedicated"`) | `packages/db/src/computers.ts` |
| Activity | `Event` stream + `runs.list` | `packages/contracts/src/events.ts`, `apps/api/src/runs.ts` |

---

## §1–2 Core principles and scope

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Persistent agents (name, role, system prompt, model, history, memory, tools, computer, routines, activity) | **EXISTS** | `Bot` has `name`, `title` (role), `description`, `instructions` (system prompt), `modelProvider`/`modelId`/`thinkingLevel`, `computerId`, `color`; `Thread` 1:1; `Routine[]`; `Run[]`. |
| Recurring work writes back into the same conversation | **EXISTS** | `wakeRoutine` creates a `Run` on the bot's thread, emits `routine.fired`, results land as normal bot messages. |
| Sensitive writes require approval | **EXISTS** (core) / **ADAPTER** (product lifecycle) | Pause/resume tool gate exists; see §16–18 for the lifecycle gap. |
| Docker default | **EXISTS** | `SANDBOX_PROVIDER=docker` default; supervisor owns the socket. |
| Simple memory | **EXISTS** | Markdown `MemoryDocument` store; optional semantic providers stay optional. |
| Self-hosted install, browser UI, login, org, roles, chat, model per agent, delegation, Docker computers, recurring work, run-now, approval queue, activity, credential isolation, Docker deployment, health, installer, CI, tests | see per-section rows | |

---

## §3–5 Architecture, repository strategy, technology

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Modular monolith: web + api + worker + Postgres + supervisor | **EXISTS** | `apps/web`, `apps/api`, `apps/worker`, `infra/sandboxes/supervisor`; Compose in `infra/compose/`. |
| Fork Rakazo, preserve structure, add LOTS packages | **DONE** (this import) | LOTS code goes in `packages/lots-*` and `apps/*/src/lots/` (see implementation plan). Upstream files are edited only at explicit integration points. |
| Stack: TS, pnpm, React, Vite, Tailwind, Hono, oRPC, Postgres, Prisma, Better Auth, Graphile Worker, Pi, Docker, Vitest, Playwright | **EXISTS** | Exact match. Extra upstream surfaces not in MVP scope: `apps/desktop` (Electron), `apps/mobile` (Expo), `apps/www` (marketing). They stay in the tree (to keep subtree pulls clean) but are excluded from LOTS dev/build/CI filters. |
| Do not introduce LangChain/Temporal/Redis/Kafka/K8s/another ORM/queue | **OK** | None present upstream. Turbo, Biome, Lingui (i18n) are present and kept. |

---

## §6 Access model (Owner / Admin / Member)

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Session-derived org scope, server-side checks | **EXISTS** | `requireMembership` + `scoped()` in `packages/db/src/scope.ts`; actor `{ userId, spaceId, email, isDeploymentOwner }`; space picked via `x-rakazo-space-id` header validated against membership. |
| OWNER role | **EXISTS** | `SpaceMember.role = "owner"` on bootstrap; space delete requires owner. |
| MEMBER role | **EXISTS** | `SpaceMember.role` default `"member"`. |
| ADMIN role | **NEW** | No `"admin"` value is used anywhere upstream. Roles are plain strings, so adding `"admin"` is a LOTS access module (`packages/lots-access`) plus checks at the LOTS RPC boundary. |
| Member management / invitations | **NEW** | Better Auth organization plugin is mounted but `blockedAuthPaths` returns 404 for create/invite/accept/reject/remove/update-role ("Not available in version 1"). Multi-member spaces only exist in tests via direct inserts. LOTS needs `admin.members.list/invite/updateRole` on top of `Member`/`SpaceMember`/`Invitation`. |
| "Cannot remove the final Owner" | **NEW** | Simple guard in the LOTS access module. |

## §7 Resource ownership

| Requirement | Verdict | Notes |
| --- | --- | --- |
| `organizationId` + `ownerUserId` on Agent, Fyr, Connection, Computer, Approval | **EXISTS** | Every relevant table carries `(spaceId, userId)`; repos filter on both. |
| Admin/Owner can see members' resources | **ADAPTER** | Upstream filters bots by `spaceId AND userId`, so even space owners do not see other members' bots. LOTS adds a role-aware visibility predicate (owner-or-admin-or-shared) applied in LOTS list/get procedures. |
| Explicit sharing via Teams | **NEW** | No share grant or Team table. See §10. |

## §8 Memory

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Conversation history + persistent memory per agent, org-scoped | **EXISTS** | `MemoryDocument`/`MemoryRevision`, scopes `bot \| user`; `Bot.memoryScope` (`isolated \| shared`) defaults to isolated. |
| `MemoryProvider` extension point with only `RakazoMemoryProvider` | **EXISTS** | Upstream already has `MemoryStore` (markdown) and `SemanticMemoryProvider` interfaces in `packages/adapter-kit`. LOTS documents these as the extension point instead of adding a new interface. Graphiti/observational memory are not added. |

## §9 Agent model

| Field | Verdict | Rakazo |
| --- | --- | --- |
| id, organizationId, ownerUserId, name, description, systemPrompt, modelProvider, modelName, defaultComputerId, createdAt, updatedAt | **EXISTS** | `Bot.id`, `spaceId`, `userId`, `name`, `description`, `instructions`, `modelProvider`, `modelId`, `computerId`, timestamps. |
| role | **EXISTS** | `Bot.title`. |
| avatar | **EXISTS** | `Bot.color` + `packages/ui-web/src/bot-avatar.tsx`; palette lives in `packages/ui-tokens`. LOTS re-themes the palette to pastels and gives the avatar a face (§28). |
| status IDLE/WORKING/WAITING/ERROR | **ADAPTER** | Upstream `Bot.status` is derived: active run status or `"idle"`. LOTS maps `queued\|leased\|running → WORKING`, `waiting_input\|waiting_takeover → WAITING`, last run `failed → ERROR`, else `IDLE`. Pure function, no schema change. |

## §10 Agent teams and delegation

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Delegation to peer agents | **EXISTS** | `message_bot` / `handoff_to_bot` (`packages/adapters/src/bot-messages.ts`, `group-handoff.ts`) wake a peer bot's own thread with intents `request\|result\|question\|status\|fyi`; `run_subagent` for in-turn helpers; `spawn_bot` for persistent children (`parentBotId`, `spawnKey`). |
| Target uses its own permissions; caller cannot grant more | **EXISTS** | Peer bots run under their own bot/user/space; subagents inherit parent tools minus delegation tools. |
| Delegation visible in activity | **EXISTS** | `subagent`, `child_bot`, `handoff`, `bot_message_sent/received` message blocks and `thread.subagent` events. |
| Team entity with LEAD/SPECIALIST/REVIEWER | **ADAPTER** | `CapabilityInstall` (`kind: lots-team`) stores membership and `lead\|specialist\|reviewer`. Visibility uses `sharedViaTeam`. Delegation itself stays on `message_bot`. |

## §11–13 Fyrar

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Fields: id, org, agent, name, instruction, schedule, timezone, enabled, nextRunAt, lastRunAt, createdBy | **EXISTS** | `Routine`: `id`, `spaceId`, `botId`, `name`, `prompt`, `crons[]` (5-field cron via `croner`; `@once` sentinel), `timezone` (default UTC), `active`, `nextRunAt`, `lastRunAt`, `userId`. |
| Create / edit / pause / resume | **EXISTS** | `routines.create/update/remove`; pause = `update({ active: false })`. |
| Run now | **EXISTS** | `routines.testRun` creates a `Run` with `trigger: "routine"` and enqueues `run.continue`. |
| Run history per Fyr | **ADAPTER** | `Routine.runs` relation exists; no RPC lists runs by routine. LOTS adds `fyrar.runs` over `Run where routineId`. |
| Result appended to agent conversation | **EXISTS** | `wakeRoutine` runs on the bot thread. |
| Run statuses QUEUED/RUNNING/WAITING_APPROVAL/SUCCEEDED/FAILED/CANCELLED | **ADAPTER** | Map from run status `queued\|leased\|running\|waiting_input\|waiting_takeover\|completed\|failed\|cancelled`. |
| Chat path: agent proposes a Fyr, user confirms | **ADAPTER** | Upstream `schedule_create` tool commits immediately. LOTS wraps it: mark `schedule_create` as approval-required through the existing `ActionApprovalRule`/ask-card mechanism (`planActionGate` in `packages/core/src/action-approval.ts`), and render the ask as a "Create Fyr?" card. No new scheduler, no new tool. |
| Graphile underneath | **EXISTS** | `routine.wakeup` task; reconciler re-enqueues due routines. |

## §14–15 Computers and Docker defaults

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Docker provider only | **EXISTS** | `packages/adapters/src/sandbox-factory.ts`; E2B/Daytona/Box/desktop remain optional and hidden by LOTS UI. |
| Resource limits, isolated workspace, explicit mounts, no public socket, job timeout, persistent workspace, lifecycle managed by Rakazo | **EXISTS** | Supervisor (`infra/sandboxes/supervisor`) is the only socket holder; bearer `SANDBOX_SUPERVISOR_TOKEN`; `RAKAZO_COMPUTER_MEMORY/CPUS/PIDS_LIMIT` (2g/2/2048), CapDrop ALL, no-new-privileges; `SANDBOX_COMMAND_TIMEOUT_MS` (300 s); `SANDBOX_IDLE_MS` (600 s); home mounted under `DATA_DIR`. |
| Computers page (name, provider, online/offline, active jobs, assigned agents) | **NEW** (UI) / **ADAPTER** (data) | Upstream has a per-bot "Agent computer" panel only. Data exists: `Computer.state` (`stopped\|booting\|running\|suspended\|error`), `Bot.computerId`, `Run` status. LOTS adds `computers.list/get` and a page. |
| Trusted local mode under Advanced | **EXISTS**, hidden | `SANDBOX_PROVIDER=desktop` exists; LOTS does not surface it in MVP. |

## §16–18 Approvals, action classes, interception

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Tool call paused, user approves, execution resumes with the exact approved payload | **EXISTS** | Executor writes `ExternalEffect{status:"intended", request}` + `ask` block, returns `approvalPausedToolResult()`; run → `waiting_input`; `threads.answer` sets `approved/denied` and re-enqueues `run.continue`; worker replays approved args only (`approval-effect.ts`). This satisfies "approved payload cannot be modified". |
| Per-tool/category policy with sensible defaults | **EXISTS** | `ActionApprovalRule{effect: always_allow\|require_approval, matchKind: tool\|connector\|category}`; builtin always-ask list; mutating-name heuristic for connector tools. |
| Approval lifecycle PENDING/APPROVED/REJECTED/EXPIRED/CONSUMED | **ADAPTER** | Upstream statuses: `intended → approved\|denied → executing → completed\|uncertain`. Mapping: `intended→PENDING`, `approved→APPROVED`, `denied→REJECTED`, `executing\|completed→CONSUMED`. **EXPIRED is missing**: LOTS adds an `approval.expire` Graphile task and a status write. |
| Approval classes READ / DRAFT / EXTERNAL_WRITE / DESTRUCTIVE | **NEW** (small) | Upstream classifies by tool name heuristics. LOTS packs declare `classification` explicitly (§27) and a small mapper turns `EXTERNAL_WRITE\|DESTRUCTIVE` into "require approval" through the existing gate; READ/DRAFT bypass it. |
| Approvals page (Pending / History) | **NEW** (UI) / **ADAPTER** (data) | Upstream shows approvals inline as `AskCard` in the thread. LOTS adds `approvals.list/get/approve/reject` reading `ExternalEffect` joined with the pending `ask` block, and reuses `threads.answer` to approve/reject so the resume path is untouched. |
| Only protected pack actions go through interception | **EXISTS** | Local computer/file/shell/memory/schedule tools are explicitly exempt upstream. |

## §19–20 Idempotency and ambiguous writes

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Idempotency for external writes | **ADAPTER** | `ExternalEffect.idempotencyKey` is unique; replay of `completed` returns the stored result. Pack writes use `lotsEffectIdempotencyKey` (org + agent + run + tool + destination + payload hash). |
| UNKNOWN outcome, no blind retry | **EXISTS** | Effect status `uncertain`; `settleUncertainEffect` in the executor. |
| Reconciliation for Gmail send / Calendar create / GitHub issue+comment | **NEW** | Pack-level `reconcile()` implementations (§27) and an `effect.reconcile` Graphile task that calls them. |

## §21 Credentials

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Encrypted at rest, reference in DB | **EXISTS** | `EncryptedSecretStore` (AES-256-GCM, scrypt, AAD = record id) in `packages/adapters/src/secrets.ts`; `Secret`, `BotSecret`, `Connection.secretId`. |
| Agent never sees raw credentials | **EXISTS** | Tools execute in API/worker via connector providers; secrets are resolved server-side and never returned by list DTOs. |
| Redaction in logs/activity | **EXISTS** / verify in Phase 8 | `packages/core/src/secrets-guard.ts`; add LOTS redaction tests for pack payloads. |

## §22–27 Packs

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Pack/tool registration surface | **EXISTS** | `ConnectorProvider` (+ `ManagedConnectorProvider`, `ConnectionAuthProvider`) in `packages/adapter-kit/src/interfaces.ts`; tool shape `{ name, description, inputSchema, readOnly?, route? }`, `execute(call) → AsyncIterable<ConnectorEvent>`; stacked in `apps/worker/src/index.ts` (`createConnectorStack`). |
| `definePack()` API with `classification`, `execute`, `reconcile` | **NEW** (thin) | `packages/lots-packs` wraps `ConnectorProvider` so a pack is a declarative object and classification feeds the approval gate. |
| Web Research (search, fetch, extract, summarize) | **EXISTS** | Builtin `web_search`/`web_fetch` via `KeylessHttpWebProvider` (DuckDuckGo HTML + Readability, SSRF-hardened). LOTS exposes them as the "Web Research" pack (enabled by default) and adds a summarize helper. |
| GitHub / Gmail / Google Calendar with first-party OAuth | **NEW** | Upstream reaches these apps through Composio or Pipedream Connect (managed catalogs requiring a vendor key). The spec forbids packs from having their own auth model and requires credential isolation, so LOTS implements one shared Google OAuth flow (Gmail + Calendar scopes) and a GitHub OAuth App flow inside `packages/lots-packs`, storing tokens through `EncryptedSecretStore`/`Connection`. The Composio emulator in `packages/testkit` already covers GMAIL/GITHUB/GOOGLECALENDAR shapes and is reused for CI mocks. |
| Connection model (`pending\|connected\|revoked\|error`) | **EXISTS** | `Connection` + `connections.*` RPC. |

## §28–37 UI

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Design tokens, theming | **EXISTS** | `packages/ui-tokens/src/index.ts` (`lightTokens`, `darkTokens`, `botColors`, `renderTokensCss()`); shadcn components in `packages/ui-web`. LOTS changes palette values (pastel agent colors, black type) without changing the token system. |
| Agent avatar (rounded square, pastel, face) | **ADAPTER** | `packages/ui-web/src/bot-avatar.tsx` renders a colored square today; LOTS adds the face and pastel palette. |
| Navigation: Inbox, Agents, Fyrar, Approvals, Packs, Activity, Computers, Admin, Settings | **NEW** | Upstream sidebar is bot list + Activity + Integrations + Settings. LOTS adds a top-level nav and routes. |
| Agent chat screen | **EXISTS** | `apps/web/src/pages/Shell.tsx` (thread, composer, realtime via `threads.subscribe`, `AskCard`, block renderers for `text`, `card`, `ask`, `progress`, `steps`, `subagent`, `child_bot`, `file`, `image`, `handoff`, …). LOTS reuses it and adds the detail panel (model, computer, packs, Fyrar). |
| Agents grid, Fyrar page, Approvals page, Packs page, Activity page, Admin page, Computers page, Inbox | **NEW** (UI) over **EXISTS/ADAPTER** data | Each page is a view over existing or thin RPCs listed above. |
| Human-readable Activity timeline | **ADAPTER** | `lots.activity.list/get` over `Event` with a formatter (delegation, fyrar, approvals). `/app/activity`. |
| Onboarding (workspace → model → first agent → packs → Docker check) | **EXISTS** / **ADAPTER** | `apps/web/src/pages/Onboarding.tsx`: `model → integrations → bot`. LOTS renames copy, defaults the first agent to "Assistant", adds the Docker health step. |
| i18n | **EXISTS** | Lingui; English catalog is the source of LOTS copy. Other locales fall back until translated. |

## §38–43 Onboarding, installer, compose, health, jobs

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Compose: web, api, worker, postgres, supervisor | **EXISTS** | `infra/compose/docker-compose.yml` services: `postgres`, `supervisor`, `computer`, `data-init`, `api`, `worker`, `web`; volumes `pgdata` + `DATA_DIR` bind (images variant uses named `appdata`). |
| `install.sh` with `--update/--uninstall/--delete-data/--dev`, preserves data and secrets | **ADAPTER** | `infra/compose/install-images.sh` already preserves `.env` and generates secrets; flags are `--prepare-only/--local/--pull-never/--offline`. LOTS adds `infra/install/install.sh` that wraps it and adds the required flags; `infra/updater` handles in-place updates. |
| Health: `/health`, `/health/db`, `/health/worker`, `/health/computer` | **ADAPTER** | `GET /health` exists (runtime, sandbox, jobs, realtime, revision) but does not ping the DB; supervisor has its own `/health`. LOTS adds the three sub-routes in `apps/api` and a Settings → System panel. |
| Graphile tasks: run Fyr, resume after approval | **EXISTS** | `routine.wakeup`, `run.continue`. |
| Graphile tasks: reconcile ambiguous write, expire approval, cleanup | **NEW** (small) | Add `effect.reconcile`, `approval.expire`, `lots.cleanup` to `BackgroundJobPayloads` + `createBackgroundJobHandlers`. Straightforward extension point. |

## §44 API / RPC

| LOTS procedure group | Verdict | Backing |
| --- | --- | --- |
| agents.list/get/create/update/archive/sendMessage/stop | **EXISTS** | `bots.*`, `threads.send`, run cancel. LOTS exposes a `lots.*` oRPC namespace mapping to these with role-aware visibility. |
| fyrar.list/get/create/update/pause/resume/runNow | **EXISTS** | `routines.*`, `routines.testRun`. |
| fyrar.runs | **ADAPTER** | new query. |
| approvals.list/get/approve/reject | **ADAPTER** | `ExternalEffect` + `threads.answer`. |
| packs.list/get/connect/disconnect/complete/enable/disable | **ADAPTER** | Enable/disable is a `CapabilityInstall` (`kind: lots-pack`); connect/disconnect reuse `Connection` + `EncryptedSecretStore` (connector id `lots`). Tokens never appear on the DTO. |
| computers.list/get/health | **ADAPTER** | `Computer` + supervisor health. |
| activity.list/get | **ADAPTER** | `Event` + `Run`. |
| admin.members.list/invite/updateRole | **NEW** | see §6. |

## §45–47 Security, prompt injection, error handling

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Server-side authz, session-derived scope, encrypted creds, no secrets in model/logs, approval on external writes, immutable approved payload, Docker not public, schema-validated tools, no host mounts / socket for agents | **EXISTS** | All present upstream; LOTS adds tests (Phase 8) rather than mechanisms. |
| Untrusted external content, prompt-injection reminders | **ADAPTER** | Add LOTS system-prompt preamble; enforcement stays in code. |
| Friendly errors with expandable technical details | **ADAPTER** | Upstream already hides tool lifecycle; LOTS adds an error mapper for computer/provider failures and the UNKNOWN copy. |

## §48–50 Testing, CI, demo seed

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Unit (Vitest), integration (Testcontainers Postgres), Playwright e2e with fake sandbox + scripted runtime + model emulator, mocked Composio catalog for Gmail/GitHub/Calendar | **EXISTS** | `packages/testkit` harness, `fake` sandbox, `AGENT_RUNTIME=scripted`, `model-emulator.ts`, `composio-emulator.ts`. |
| CI on PR: install, lint, typecheck, unit, integration, build, Playwright smoke | **EXISTS** upstream / **ADAPTER** here | Upstream `.github/workflows/ci.yml` does exactly this, but GitHub only runs workflows from the repository root. This monorepo's root CI runs `pytest`; a root workflow with `working-directory: projects/kuble` must be added (Phase 8). |
| `pnpm seed:demo` | **NEW** | No seed script upstream. |

## §58 Documentation

| Doc | Status |
| --- | --- |
| `README.md` | LOTS README (this project); upstream README preserved at `docs/upstream/README.rakazo.md`. |
| `docs/upstream-map.md` | this file |
| `docs/implementation-plan.md` | Phase 0 deliverable |
| `docs/architecture.md`, `development.md`, `fyrar.md`, `packs.md`, `approvals.md`, `access.md`, `troubleshooting.md` | Phase 8. Upstream `docs/self-host.md`, `docs/computer-runtime.md`, `docs/self-host-secrets.md` remain authoritative for the parts LOTS does not change. |
| `docs/installation.md` | Phase 7 (`infra/install/install.sh`, health endpoints, `pnpm seed:demo`). |

---

## Blockers and deviations found in Phase 0

1. **Invitations are disabled upstream by design** (`blockedAuthPaths` in `packages/auth/src/index.ts`). LOTS must either unblock the Better Auth organization routes for its own use or implement `admin.members.*` directly over `Member`/`SpaceMember`/`Invitation`. Decision: implement directly in `packages/lots-access` and keep the Better Auth paths blocked, so upstream behaviour is unchanged.
2. **Upstream bot visibility is per user even inside a shared space.** Owner/Admin visibility (spec §6–7) therefore has to be added at the LOTS boundary; upstream `listBots` is not modified.
3. **No first-party Gmail/GitHub/Calendar connectors upstream**; they come via Composio/Pipedream. Spec §27 forbids per-pack auth models and requires credential isolation, so `packages/lots-packs` implements OAuth once (Google, GitHub) and all packs use it. Composio/Pipedream remain available upstream but are not surfaced in the LOTS Packs page.
4. **Node version**: upstream `engines` requires Node `^22.22.2 || ^24 || >=26`, and a transitive dependency (`@composio/core`) requires `>=22.22.3`. Use Node 22.23+ (see `docs/development.md` when written).
5. **Docker is unavailable in the cloud development environment used for Phase 0/1**, so Postgres-backed integration tests and Playwright were not run there; unit tests and typechecking were. Nothing architectural follows from this.

No blocker requires changing the architecture. Rakazo's default Docker computer provider is used unchanged.
