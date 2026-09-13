# Approvals

Protected external writes pause on `ExternalEffect` (`status: intended`)
until someone says yes.

- UI: `/app/approvals` (Pending / History) and Inbox
- RPC: `lots.approvals.list/get/approve/reject`
- Approve/reject call Rakazo `events.answerRunInput` and continue the run.
- Stale intended effects expire after 24h (`approval.expire`).
- UNKNOWN (`uncertain`) effects show: “LOTS is checking whether this action
  completed. Do not retry it manually yet.”
- Approval cards never show raw tokens; preview fields are redacted.

Members approve their own coworkers. Admin and Owner see the workspace.
