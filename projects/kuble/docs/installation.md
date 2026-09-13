# Installing Ratatosk

Ratatosk is a product layer on Rakazo. The installer wraps Rakazo's
`infra/compose/install-images.sh` and does not add extra Compose services.

## Prerequisites

- macOS or Linux
- Git, curl, OpenSSL
- Docker with the Compose v2 plugin

## Install

From this checkout:

```bash
bash infra/install/install.sh
```

That preserves an existing `.env`, generates secrets when one is missing,
starts Postgres, API, worker, web and the Docker computer supervisor, then
waits for:

```text
/health
/health/db
/health/worker
/health/computer
```

Open <http://127.0.0.1:5173>.

### Flags

| Flag | Effect |
| --- | --- |
| `--update` | Pull images (or rebuild in `--dev`), run migrations, restart. Keeps data and secrets. |
| `--dev` | Use `infra/compose/docker-compose.yml` and build from this tree. |
| `--prepare-only` | Write compose files and `.env` if needed; do not start containers. |
| `--uninstall` | Stop containers. Volumes and `.env` stay. |
| `--delete-data` | Only with `--uninstall`. Also removes Compose volumes. |

`--uninstall` never deletes data unless `--delete-data` is supplied.

`LOTS_HOME` overrides the image-stack working directory (default:
`infra/compose`).

## Development without the installer

See the project [README](../README.md#run-development) for `pnpm dev` against
a local Postgres container.

## Demo data

After you have signed in once (so a workspace exists):

```bash
pnpm seed:demo
```

This creates Assistant, Researcher, Developer and Reviewer (reusing the
onboarding Assistant when present), two Fyrar, two example approvals and a
short thread. No external APIs are called.

## Settings → System

The System panel in Settings shows API, database, worker, Docker computer
and model provider using the health endpoints above. The Vite / preview
server proxies `/health` to the API.

## What this environment could not verify

Compose acceptance (fresh VM → healthy; rerun preserves data; uninstall
leaves volumes; `--uninstall --delete-data` removes them) needs Docker.
This checkout's checks are `bash -n`, installer smoke tests with a stub
`docker`, unit tests for the health mappers, and TypeScript.
