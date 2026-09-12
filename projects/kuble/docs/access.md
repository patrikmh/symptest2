# Access

Space roles are `OWNER | ADMIN | MEMBER`, stored lowercase on
`SpaceMember.role`. `@lots/access` maps them and answers `can(role, action)`
for every spec §6 action.

Visibility (spec §14 / §7): same space, and either the owner, an Admin/Owner,
or a coworker on a shared LotsTeam (`sharedViaTeam`).

- `lots.agents.list/get` apply visibility. Upstream `bots.list` stays
  per-user; `bots.get`, `spaces.list` (current space) and thread resolve
  use the same visibility so Admin/Owner/LotsTeam can open another
  member's chat.
- Admin Members: `lots.admin.members.list/invite/updateRole`.
- Invitees accept or decline with `lots.invitations.list/accept/decline`
  (banner after sign-in). Accept creates `Member` + `SpaceMember` on the
  inviting org and switches the client to that workspace.
- The last Owner cannot be demoted. Only Owner can invite or change Admins.
- `inspectActivity` is Admin/Owner. Members see their own activity, plus
  teammates on a LotsTeam.

LotsTeam roles (spec §10) are `LEAD | SPECIALIST | REVIEWER`. They are
metadata for prompting and Activity. Delegation still uses Rakazo
`message_bot` / handoff; the caller cannot grant extra permissions.
