# Access

Space roles are `OWNER | ADMIN | MEMBER`, stored lowercase on
`SpaceMember.role`. `@lots/access` maps them and answers `can(role, action)`
for every spec §6 action.

Visibility (spec §14 / §7): same space, and either the owner, an Admin/Owner,
or a coworker on a shared LotsTeam (`sharedViaTeam`).

- `lots.agents.list/get` apply visibility. Upstream `bots.list` is unchanged
  (still per user).
- Admin Members: `lots.admin.members.list/invite/updateRole`. Invitation
  accept is not implemented — pending invites are listed only.
- The last Owner cannot be demoted. Only Owner can invite or change Admins.
- `inspectActivity` is Admin/Owner. Members see their own activity, plus
  teammates on a LotsTeam.

LotsTeam roles (spec §10) are `LEAD | SPECIALIST | REVIEWER`. They are
metadata for prompting and Activity. Delegation still uses Rakazo
`message_bot` / handoff; the caller cannot grant extra permissions.
