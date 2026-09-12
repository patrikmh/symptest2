# Troubleshooting

## The coworker computer is unavailable

`/health/computer` is red, or the UI shows that copy. Check that Docker is
running and `SANDBOX_SUPERVISOR_TOKEN` matches the supervisor. Technical
details may mention `ECONNREFUSED` on port 7091.

## The model provider is unavailable

Settings → Models. Confirm the provider key. Scripted runtime
(`AGENT_RUNTIME=scripted`) needs no live key.

## LOTS is checking whether this action completed

An external write timed out (`uncertain`). Do not retry it in Gmail/GitHub
by hand. The `effect.reconcile` job looks it up on the connected account
(sent mail, calendar events, GitHub issues/comments).

## Tools will not connect

OAuth redirect is `${WEB_ORIGIN}/app/packs/oauth`. Set
`GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` (or the `LOTS_*` aliases) and the
matching secrets. A Gmail or Calendar 401 refreshes the Google access
token once and writes it back; if refresh fails, reconnect the account.

## An invite does not appear

The signed-in email must match the invite (case-insensitive). Expired
invites (7 days) disappear from Admin and from the join banner. Accept
switches the selected workspace (`rakazo:space-id`).

## `pnpm seed:demo` fails

Sign in once so a workspace exists, then retry. `DATABASE_URL` must point
at the same database the API uses.

## Installer / uninstall

`--uninstall` keeps volumes and `.env`. Add `--delete-data` to drop
Compose volumes. See [`installation.md`](./installation.md).

## CI

Root pytest does not typecheck Ratatosk. The `kuble` workflow runs the
LOTS unit slice when `projects/kuble/**` changes.
