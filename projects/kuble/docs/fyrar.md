# Fyrar

A Fyr is recurring work attached to a coworker (Rakazo `Routine`).

- List and detail: `/app/fyrar`, `/app/fyrar/:fyrId`
- RPC: `lots.fyrar.list/get/create/update/pause/resume/runNow/runs`
- Schedule is one or more 5-field crons. One-shot (`@once`) schedules are rejected.
- Status: `QUEUED | RUNNING | WAITING_APPROVAL | SUCCEEDED | FAILED | CANCELLED`
- Creating a Fyr from chat (`schedule_create`) asks **Create Fyr?** before it is stored.
- Graphile task `routine.wakeup` runs due Fyrar. `runNow` enqueues `run.continue`.

Members see their own Fyrar. Admin and Owner see the workspace.
