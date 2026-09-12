# Ratatosk (project `kuble`)

Ratatosk is a persistent multi-agent workspace: create AI coworkers, chat
with them continuously, give them tools, schedule recurring work (Fyrar),
let them delegate to each other, and approve sensitive actions before they
happen. See [`docs/brand.md`](./docs/brand.md) for the name and the words
people see (English *Coworkers* / Swedish *Medarbetare*).

It is a product layer on top of [Rakazo](https://github.com/elie222/rakazo)
(Apache-2.0), vendored here as a squashed `git subtree`. Rakazo provides the
agent runtime (Pi), persistent conversations, memory, routines, delegation,
Docker-backed computers and integrations plumbing. Ratatosk adds only the
product surface and the safety/control layer described in
[`LOTS_MVP_SPEC.md`](./LOTS_MVP_SPEC.md) (the spec still uses the working
name LOTS).

## Status

Phases 0–5 (inspection, Ratatosk shell, access, Fyrar, approvals, packs)
are in place. See [`docs/implementation-plan.md`](./docs/implementation-plan.md)
for the slice-by-slice checklist and
[`docs/upstream-map.md`](./docs/upstream-map.md) for what is reused from
Rakazo versus built here.

## Layout

```text
apps/web, apps/api, apps/worker   Rakazo applications (Ratatosk UI under src/lots/)
packages/*                        Rakazo packages; Ratatosk packages are packages/lots-*
infra/                            Compose files, sandbox supervisor, computer image, updater
docs/                             Rakazo docs plus Ratatosk docs (brand, upstream-map, plan)
docs/upstream/README.rakazo.md    The upstream README as imported
LOTS_MVP_SPEC.md                  The product specification this project implements
tests/                            Monorepo-level smoke checks (pytest); real tests are TypeScript
```

`apps/desktop`, `apps/mobile` and `apps/www` come from upstream and are out of
scope for the MVP; they stay in the tree so upstream can be pulled cleanly.

## Run (development)

Requirements: Node.js 22.23+ (or 24.x), pnpm 9 via Corepack, Docker with the
Compose plugin.

```bash
cd projects/kuble
cp .env.example .env            # then set POSTGRES_PASSWORD, DATABASE_URL, BETTER_AUTH_SECRET,
                                # ENCRYPTION_KEY, SCREEN_PROXY_SECRET, SANDBOX_SUPERVISOR_TOKEN
docker compose --env-file .env \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.postgres-host.yml up postgres -d
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm sandbox:build
corepack pnpm dev
```

Open <http://127.0.0.1:5173>. Upstream's [self-hosting guide](./docs/self-host.md)
and [computer runtime notes](./docs/computer-runtime.md) still apply. A
Ratatosk `install.sh` arrives in Phase 7.

## Test

```bash
# TypeScript (from projects/kuble)
corepack pnpm lint
corepack pnpm check
corepack pnpm test
corepack pnpm test:integration      # needs Docker (Testcontainers Postgres)
corepack pnpm test:e2e              # Playwright, fake sandbox + scripted runtime

# monorepo smoke checks (from the repo root)
pytest projects/kuble
```

## Updating upstream

```bash
git subtree pull --prefix=projects/kuble https://github.com/elie222/rakazo.git main --squash
```

Then re-check the integration points listed in `docs/upstream-map.md`.
