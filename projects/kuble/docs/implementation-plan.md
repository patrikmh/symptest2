# LOTS MVP implementation plan

Vertical slices with explicit acceptance tests, derived from
[`LOTS_MVP_SPEC.md`](../LOTS_MVP_SPEC.md) §51 and the findings in
[`upstream-map.md`](./upstream-map.md). Each slice is small enough to land as one
reviewable PR and leaves the product usable.

Ground rules for every slice:

- `reuse > adapt > extend > rewrite`. Upstream files are edited only at the
  integration points listed per slice; everything else lives in LOTS-owned code.
- LOTS-owned code locations:
  - `packages/lots-core` — pure domain helpers (status mapping, classification, keys).
  - `packages/lots-access` — roles, visibility predicate, member management.
  - `packages/lots-approvals` — approval lifecycle over `ExternalEffect`, expiry, reconcile jobs.
  - `packages/lots-packs` — `definePack()`, the four packs, shared OAuth.
  - `apps/web/src/lots/` — LOTS pages, navigation frame, agent cards.
  - `apps/api/src/lots/` — `lots.*` oRPC procedures and health sub-routes.
  - `infra/install/` — `install.sh`.
- Vocabulary stays Rakazo's in code and Ratatosk's in UI copy (Coworker, Fyr, Tool, Approval). See [`brand.md`](./brand.md).
- Deterministic offline tests by default (Vitest; fake sandbox; scripted runtime;
  model emulator; Composio emulator for Gmail/GitHub/Calendar shapes).
- `apps/desktop`, `apps/mobile`, `apps/www` remain in the tree but outside LOTS
  dev/build/CI filters.

Status legend: `[x]` done, `[~]` in progress, `[ ]` not started.

---

## Phase 0 — Inspect upstream

- [x] Import Rakazo as a squashed subtree at `projects/kuble/` (upstream `52e9aa2`).
- [x] `docs/upstream-map.md` classifying every requirement.
- [x] This plan.
- [x] Project README; upstream README kept at `docs/upstream/README.rakazo.md`.

Acceptance: both documents exist; every spec section §1–§50 has a row in the map.

---

## Phase 1 — Ratatosk shell

Goal: the app is recognisably Ratatosk, has the Ratatosk navigation, lists
coworkers as cards, and chat works unchanged on the Rakazo runtime.

### Slice 1.1 — Branding

- [x] Product name "Ratatosk" in `apps/web/index.html` (title, PWA title, description), `site.webmanifest`, the `Wordmark`, the Welcome page and the sign-in/sign-up headings. Story and vocabulary: [`docs/brand.md`](./brand.md).
- [x] Pastel agent palette replaces `BOT_COLORS` (`packages/contracts/src/ids.ts`) and `botColors` (`packages/ui-tokens`).
- [x] New avatar style `"lots"` in `packages/ui-web` (rounded square, pastel fill, two dark eyes, smile variant by identity). New users default to it (Prisma default + migration `20260911000000_lots_avatar_style`); upstream `robot`/`organic` styles remain selectable.
- [x] Swedish UI locale (`sv`) for Ratatosk chrome (Medarbetare, Fyrar, Verktyg, Delad/Egen dator). Other strings fall back to English.
- [ ] Re-extract Lingui catalogs (`pnpm --filter @rakazo/web intl:extract`) once remaining copy settles; until then new strings fall back to English.

Upstream edit points: `apps/web/index.html`, `apps/web/public/site.webmanifest`, `packages/ui-web/src/bot-avatar.tsx` (`LotsAvatar` branch, `Wordmark`), `packages/ui-web/src/avatar-style.tsx` (type union), `packages/contracts/src/{ids,domain}.ts`, `packages/ui-tokens/src/index.ts`, `packages/db/prisma/schema.prisma`, `apps/api/src/router.ts` (avatar style normalisation), `apps/web/src/pages/{Shell,AccountSettingsOverlay,Welcome,Auth}.tsx`.

Acceptance (unit): `bot-avatar.test.tsx` renders the `lots` style with the bot colour and no visor/ring; mobile `theme.test.ts` pins the first palette entry.

### Slice 1.2 — Navigation frame

- [x] `apps/web/src/lots/LotsFrame.tsx`: persistent left rail with Inbox, Coworkers, Fyrar, Approvals, Tools, Activity · Computers, Admin, Settings; mobile bottom bar with Inbox, Coworkers, Fyrar, More.
- [x] Routes under `/app/*` wrapped in the frame; `/app` lands on Coworkers. `/app/:botId` and `/app/g/:groupId` keep rendering the upstream `ShellPage` (chat) inside the frame.
- [x] Settings opens the upstream settings overlay through `?settings=<section>`.
- [x] Pages not yet implemented (`PlannedPage`) render a calm empty state and a next step that already works.

Upstream edit points: `apps/web/src/App.tsx` (route table), `apps/web/src/pages/Shell.tsx` (one effect reading `?settings=`).

Acceptance (unit): `nav.test.ts` asserts item order, groups, mobile subset and active-key resolution (static paths win over `:botId`).

### Slice 1.3 — Agents page

- [x] `apps/web/src/lots/AgentsPage.tsx`: grid of agent cards (avatar, name, role, LOTS status pill, latest message preview, computer). Data from the upstream `bots.list` RPC.
- [x] `packages/lots-core` (`@lots/core`): `agentStatusFromRunStatus()` mapping Rakazo run status → `IDLE | WORKING | WAITING | ERROR`; `AGENT_TEMPLATES` (Assistant, Researcher, Developer, Sales Scout, Reviewer) with the spec §46 prompt-injection reminders baked into their instructions.
- [x] "New agent" dialog: pick a template, optional name → `bots.create` → navigate to the agent's chat.
- [x] Loading, empty and error states.

Acceptance (unit): `agent-status.test.ts` status table and template tests pass. Acceptance (manual now, Playwright in Phase 8): create agent → chat → reload → history persists (Journey 1 steps 4–7, on the unchanged upstream Shell).

### Slice 1.4 — Onboarding copy

- [x] Onboarding steps read: Create workspace → Connect model → Create first coworker (Assistant — "General AI coworker for research and organization.") → Enable tools (Web Research on) → Computer check.
- [x] The computer step reads `/health/computer` (`computerHealthFromPayload` in `@lots/core`).
- [x] First coworker is created from `firstBotProfile()` (Assistant template + `onboarding:first` spawn key). Leftover Chief bots are still reused.

Upstream edit points: `apps/web/src/pages/Onboarding.tsx` (copy + packs/computer steps).

Acceptance (unit): `first-bot.test.ts` — profile name/description and spawn key; computer health table.

---

## Phase 2 — Access

### Slice 2.1 — Roles

- [x] `packages/lots-access`: `Role = OWNER | ADMIN | MEMBER`, `roleFromSpaceMember()`, `can(role, action)` table matching spec §6.
- [x] Prisma: no schema change; `"admin"` is a new value of `SpaceMember.role`.

Acceptance (unit): permission table tests for every action × role.

### Slice 2.2 — Visibility predicate

- [x] `visibleTo(actor, resource)` = same space AND (owner OR admin/owner OR shared via team).
- [x] `lots.agents.list/get` in `apps/api/src/lots/` apply the predicate; upstream `bots.*` untouched.

Acceptance (integration): Member A cannot `lots.agents.get` Member B's agent (404), Admin can, Owner can.

### Slice 2.3 — Members admin

- [x] `lots.admin.members.list/invite/updateRole` over `Member`/`SpaceMember`/`Invitation`; final-owner guard.
- [x] Admin page → Members tab.

Acceptance (integration): invite creates an `Invitation`; role change to OWNER/ADMIN/MEMBER persists; removing the last OWNER is rejected.

---

## Phase 3 — Fyrar

### Slice 3.1 — Fyrar RPC facade

- [x] `lots.fyrar.list/get/create/update/pause/resume/runNow/runs` mapping to `routines.*`, `routines.testRun`, and a new `Run where routineId` query.
- [x] Status mapping to `QUEUED | RUNNING | WAITING_APPROVAL | SUCCEEDED | FAILED | CANCELLED`.

Acceptance (integration): create → runNow → run appears in `fyrar.runs` and result message lands in the agent thread (fake sandbox, scripted runtime).

### Slice 3.2 — Fyrar UI

- [x] Fyrar page cards (name, agent, schedule in words, next run, Run now / Pause).
- [x] Fyr detail: instruction, schedule, agent, run history, latest result, edit.
- [x] "Create Fyr" from the agent detail panel.

Acceptance (e2e B): Create Fyr → run now → result appears in chat.

### Slice 3.3 — Propose from chat

- [x] `schedule_create` marked approval-required via the existing gate; ask card rendered as "Create Fyr?" with name and schedule; confirm creates the routine.

Acceptance (integration): scripted bot calls `schedule_create` → run enters `waiting_input` → answer allow → routine exists.

---

## Phase 4 — Approvals

### Slice 4.1 — Lifecycle facade

- [x] `packages/lots-approvals`: `approvalStatusFromEffect()` (intended→PENDING, approved→APPROVED, denied→REJECTED, executing/completed→CONSUMED, plus EXPIRED), `lots.approvals.list/get/approve/reject` (approve/reject call the upstream answer path so replay of the exact approved payload is unchanged).
- [x] Graphile task `approval.expire` (default TTL 24 h) → status EXPIRED, run continues with a denied tool result.

Acceptance (unit): state-transition table; (integration): protected action → PENDING → approve → executor runs → CONSUMED; expired approval cannot be approved.

### Slice 4.2 — Approvals UI and Inbox

- [x] Approvals page: Pending / History; card with agent, human summary, payload preview, Reject/Approve, expandable details.
- [x] Inbox: pending approvals, failed Fyrar, completed Fyrar, updates — in that order.

Acceptance (e2e C): agent wants to send Gmail (emulated) → approval appears → approve → send succeeds → activity records it.

---

## Phase 5 — Packs

### Slice 5.1 — Pack API

- [x] `packages/lots-packs`: `definePack({ key, name, description, connection, tools })`, tool `{ name, classification, inputSchema, execute, reconcile? }`; adapter to `ConnectorProvider`; classification → approval gate (`EXTERNAL_WRITE`/`DESTRUCTIVE` require approval).
- [x] Pack enable/disable stored as `CapabilityInstall` (`kind: lots-pack`) + `lots.packs.list/enable/disable`.

Acceptance (unit): classification mapping; a pack cannot register a tool without a classification.

### Slice 5.2 — Web Research

- [x] Wraps builtin `web_search`/`web_fetch`; adds `web.extract` and `web.summarize`; enabled by default.

Acceptance (unit): results carry content, title, URL, timestamp.

### Slice 5.3 — Shared OAuth + Connections

- [x] One Google OAuth flow (Gmail + Calendar scopes) and one GitHub OAuth App flow; tokens stored via `EncryptedSecretStore` and `Connection`; `lots.packs.connect/disconnect`.
- [x] Packs page grid and detail.

Acceptance (integration, mocked provider): connect → `Connection.status = connected`; API never returns token material.

### Slice 5.4–5.6 — GitHub, Gmail, Calendar packs

- [x] Tools and classifications exactly as spec §24–§26.

Acceptance (integration with emulators): read tools execute without approval; write tools create PENDING approvals.

---

## Phase 6 — Idempotency and ambiguous writes

- [x] Idempotency key = org + agent + run + tool + destination + normalized payload hash (in `lots-core`); set on `ExternalEffect.idempotencyKey`.
- [x] `reconcile()` for `gmail.send`, `calendar.create`, `github.createIssue`, `github.comment`; Graphile task `effect.reconcile` for `uncertain` effects; UI copy "LOTS is checking whether this action completed."

Acceptance (unit): key stability under payload key reordering; (integration): approved Gmail send replayed twice sends once; a timed-out send becomes UNKNOWN, reconcile finds it → SUCCEEDED without resending.

---

## Phase 7 — Installer and health

- [x] `infra/install/install.sh` wrapping `infra/compose/install-images.sh` with `--update`, `--uninstall`, `--delete-data`, `--dev`; preserves `.env`, volumes, credentials; `--uninstall` never deletes data without `--delete-data`.
- [x] `/health/db`, `/health/worker`, `/health/computer` in `apps/api`; Settings → System panel.
- [x] `pnpm seed:demo`.

Acceptance (shell test with Compose available): fresh install → healthy; rerun → data preserved; `--uninstall` leaves volumes; `--uninstall --delete-data` removes them. Journey 5 (restart) passes.

---

## Phase 8 — Hardening

- [x] Auth/RBAC tests, secret-redaction tests for pack payloads and activity text.
- [x] Friendly error mapper (computer unavailable, provider down, UNKNOWN write).
- [x] Delegation surfaced in Activity; `LotsTeam` with LEAD/SPECIALIST/REVIEWER (Journey 4).
- [x] Root-level CI workflow for `projects/kuble` (lint, typecheck, unit on the LOTS slice). Integration and Playwright stay in upstream `projects/kuble/.github/workflows` (GitHub does not run nested workflows).
- [x] Remaining docs from spec §58: `architecture.md`, `development.md`, `fyrar.md`, `packs.md`, `approvals.md`, `access.md`, `troubleshooting.md`.

Acceptance: Journeys 1–5 are automated where the checkout allows and otherwise documented in [`development.md`](./development.md); Definition of Done (§57) is in [`architecture.md`](./architecture.md).
