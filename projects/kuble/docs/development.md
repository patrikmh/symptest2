# Development

Requirements: Node.js 22.23+ (or 24.x), pnpm 9 via Corepack. Docker is
needed for Postgres-backed integration tests and a real computer runtime.

```bash
cd projects/kuble
cp .env.example .env            # set the secrets listed in the README
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:migrate        # needs DATABASE_URL
corepack pnpm dev
```

Open <http://127.0.0.1:5173>. After signing in once, `pnpm seed:demo`
fills Assistant, Researcher, Developer, Reviewer, two Fyrar and two
example approvals.

## Tests

```bash
pnpm --filter @lots/core --filter @lots/access --filter @lots/approvals --filter @lots/packs test
pnpm --filter @rakazo/api test -- apps/api/src/lots
pnpm --filter @rakazo/web test -- apps/web/src/lots
pnpm --filter @lots/core --filter @rakazo/api --filter @rakazo/web check
```

`pnpm test:integration` and `pnpm test:e2e` need Docker and are the
upstream Rakazo harness (fake sandbox, scripted runtime). This cloud
checkout does not run them.

Root CI for this monorepo is [`.github/workflows/kuble.yml`](../../.github/workflows/kuble.yml).

## Journeys (spec §56)

| Journey | How it is covered |
| --- | --- |
| 1 Agent — create Researcher, chat, reload | Unit: templates + agents page. Admin/Owner open another member's chat via visibility adapters. Manual/Playwright: upstream Shell. |
| 2 Fyr — “every weekday at 8”, confirm, Run Now | Unit: fyrar RPC + Create Fyr approval. Compose/chat path needs a running app. |
| 3 Approval — draft email, approve, send | Unit: approvals + pack idempotency. Live Gmail execute is not wired. |
| 4 Delegation — Researcher → Reviewer | Activity formats `thread.subagent` / `group.handoff`. LotsTeam stores LEAD/SPECIALIST/REVIEWER. Delegation itself is Rakazo `message_bot`. |
| 5 Restart — stop/start containers | Installer `--update` / Compose restart. Not run here (no Docker). |

## Conventions

- UI copy: Coworker / Fyr / Tool / Approval. Swedish chrome is first-class.
- Do not run `lingui extract` unless asked.
- Do not import `@lots/*` from `packages/adapters`.
