# Agentic OS Edge — Canonical Architecture Specification v6.0

Status: production architecture baseline (supersedes v5.6)
Target: private, self-hosted agentic operating system for small and mid-sized organisations
Deployment: one appliance (Raspberry Pi 5, Mac mini, DGX Spark or equivalent); optional worker machines later
Core loop: Propose → Decide → Do → Prove

## Changes from v5.6

v6.0 keeps the v5.6 security kernel intact and removes everything that a
first customer on one machine does not need. Removed items are listed in
Part XIX (Deferred) so the roadmap is explicit rather than lost.

Kept unchanged in substance: Propose → Decide → Do → Prove, CONTROL vs DATA,
Effect Ledger with first-class UNKNOWN, Dispatch Barrier, digest-bound
approvals, credential isolation, browser isolation, no vendor root, evidence
over claims, the safety-test discipline.

Added:

- Control Plane / Worker Plane as a normative code boundary (Part VI)
- Assistants: named, persistent, memory-bearing teammates that only execute as Runs (Part VII)
- Skills and learning without authority (Part X)
- Model routing for local / hybrid / API inference, with external inference treated as data egress (Part XI)
- Gondolin as the single sandbox implementation on all supported hardware (Part VIII)
- Three deployment profiles with reference values (Part XVI)
- Explicit V1 build order including the kernel phases missing from v5.6 (Part XVIII)

Simplified:

- Roles: Owner, Member, Auditor (Manager/Admin deferred)
- Authority: per-capability mode `automatic | ask` plus expiring grants (four-level autonomy deferred)
- Policy editing: a table with audit, not a draft/validate/diff/publish engine
- Widgets: in-repo packs versioned with the appliance (independent signed packages deferred)
- Database: SQLite only; the control plane is the single writer
- Break-glass: physical access + recovery key + one command
- ConflictFence, Reconciler, Resource Governor: functions and a config file, not components

---

## Part I — Law

### 1. Purpose

Agentic OS Edge turns a company-owned machine into a governed agentic
environment: AI assistants, automation, company knowledge, coding sandboxes,
web research and external integrations, with company data kept local and
with the model never treated as a trusted authority.

### 2. Promise

A user states a goal in ordinary language. The system plans, retrieves
evidence, delegates to agents, asks for approval when required, executes,
verifies outcomes and preserves evidence. It is usable in an afternoon by a
company with no IT department.

### 3. Architecture

```
Humans
  ↓
Presentation (dashboard, mobile web)
  ↓
Control Plane   (authority, ledger, audit, knowledge, scheduling)
  ↓
Worker Plane    (inference, sandbox, browser, embeddings)
  ↓
Adapters / Widgets
  ↓
External systems
```

Every external effect crosses the Control Plane.

### 4. Primary invariant

Agents may propose. Agents have no inherent authority. Authority comes from
published policy, grants and approvals.

### 5. Propose → Decide → Do → Prove

Planning and model output happen before authority is exercised. Evidence is
produced after execution. Completion text from an agent is not evidence.

### 6. The model is an untrusted I/O device

Models interpret, reason, transform, draft and suggest tool calls. They never
decide whether a capability is authorised.

### 7. Modular monolith

The Control Plane is one process with internal modules. Modules are not
split into network services for symmetry. The only network boundaries are
the unreliable ones: providers, browser, sandbox, webhook senders, external
model APIs, and (later) worker machines.

### 8. Private by default

The appliance is fully functional without any vendor cloud. Company data
leaves the machine only through a configured provider and a governed effect.
External model inference is such an effect (Part XI).

### 9. Least authority, no hidden root

Each action receives only the authority it needs. There is no ambient
credential, no globally reusable tool access, and no permanent vendor
principal.

### 10. Safe failure and recoverability

When authority or effect state is ambiguous the system stops and explains
rather than guesses and mutates. Rare failures need not be impossible if they
are detected, contained, explained and recoverable.

### 11. Irreversible effects last

Within a workflow, irreversible external effects happen as late as possible.

### 12. Safety properties are executable

Every invariant in this document that can be tested is a test (Part XVII).
An invariant without a test is a wish.

---

## Part II — Domain model

### 13. Organisation

The top-level governance boundary. One per appliance in V1.

### 14. Project

A collaboration and authority boundary inside the organisation. Holds
members, Runs, Knowledge, Automations, grants and artifacts. V1 ships with a
default project that every member belongs to; additional projects are
optional.

### 15. Principal

An identity that participates in policy evaluation. Kinds: `HUMAN`,
`AUTOMATION`. (`SERVICE` deferred.)

### 16. Assistant

A named, persistent teammate a user talks to. An Assistant is a persona plus
a memory scope plus a default project plus zero or more standing grants. An
Assistant never runs as a daemon; every action it takes is a Run. This is the
user-facing noun that makes the system feel like a colleague rather than a
console.

### 17. Run, Task, Step

A Run is one execution of a goal, automation or inbound event and is the
primary unit shown in Work. A Run may contain Tasks (bounded units for an
agent or deterministic worker). A Task may contain Steps (checkpoints).

### 18. Effect

A proposed or attempted state change outside pure reasoning, e.g.
`mail.send`, `calendar.create`, `repo.pr.create`, `file.write`.

### 19. Artifact

Durable evidence or output with provenance: file, diff, report, screenshot,
extracted page, structured result, provider response.

### 20. Approval

A human decision bound to the digest of one exact proposed effect or one
bounded grant request.

### 21. Capability

A typed operation that policy can evaluate, namespaced by domain:
`mail.*`, `calendar.*`, `repo.*`, `web.*`, `knowledge.*`, `model.*`.

### 22. Grant

Authorisation of a capability under explicit constraints: project,
connection, resource, principal or automation, CONTROL values, expiry.

### 23. Connection

Technical provider access (an OAuth identity, an app installation, an API
key). Connection is not authorisation.

### 24. Skill

A project-scoped, versioned procedure written in natural language or a
simple step format, with provenance. A Skill is DATA. It carries no
authority (Part X).

---

## Part III — Trust

### 25. CONTROL vs DATA

CONTROL determines what an action targets: recipient, calendar, repository,
branch, attendee, URL. DATA is the content the action carries: body, title,
issue text, description.

### 26. Trusted CONTROL

Every CONTROL field on an effect carries `trusted: true|false` and a
provenance reference. A CONTROL value is trusted only through an explicit
transition: user typed or selected it, it matches a policy allowlist, or it
was approved by a human on an approval card that displayed it.

### 27. External content is adversarial

Email, issues, webpages, documents, webhook bodies and model output derived
from them are untrusted. Prompt injection is an expected property of such
content, not an exception. Instructions inside untrusted content grant
nothing.

### 28. No trust upgrade by transformation

Parsing into JSON, extraction by a model, summarisation, or a valid webhook
signature does not make content trusted. Tool schemas constrain syntax, not
authority.

### 29. Provenance

Artifacts and Knowledge chunks retain source, retrieval time, producing Run,
producing model or tool, and transformation chain.

---

## Part IV — Capabilities and policy

### 30. Capability descriptor

Name, provider, risk class (`READ`, `LOCAL_WRITE`, `EXTERNAL_REVERSIBLE`,
`EXTERNAL_IRREVERSIBLE`), idempotency class (`PURE`, `IDEMPOTENT`,
`RECONCILIABLE`, `UNSAFE_TO_REPEAT`), CONTROL schema, DATA schema, resource
selector, reconciliation function, and behaviour when provider outcome is
unknown.

### 31. Policy is a table

Policy in V1 is:

```
policy_rules(project_id, capability, mode, updated_by, updated_at)
  mode ∈ { off, ask, automatic }
grants(id, capability, project_id, connection_id, principal_or_automation_id,
       control_constraints_json, granted_by, granted_at, expires_at, revoked_at)
```

`off` means the capability is not offered to agents in that project. `ask`
means every effect needs an approval. `automatic` means policy alone
suffices. Grants narrow `ask` to `automatic` for specific CONTROL values.
Every change is an AuditEvent. There is no separate draft/publish engine.

### 32. Policy bundles

Onboarding offers three bundles that fill the table: `Cautious`, `Standard`,
`Trusting`. `Standard` is the recommended defaults in §77. Owners can edit
individual rows afterwards.

### 33. Grant-from-approval

An approval card for an `ask` capability offers "allow this automatically
for [narrowed CONTROL] for [duration]". Accepting creates a Grant through the
normal path. This is the mechanism that keeps approval volume tolerable.

### 34. Current policy wins

Authority is evaluated immediately before dispatch, not at proposal time.
Narrowing blocks stale effects. Widening never retroactively authorises a
denied proposal.

### 35. Roles are not agent capabilities

A human's role governs what they may see and administer. It grants nothing
to agents.

---

## Part V — Effect lifecycle

### 36. Effect Ledger

Every externally meaningful effect is a row in the ledger with states:

```
PROPOSED → PREPARED → [WAITING_APPROVAL] → DISPATCHING → SUCCEEDED | FAILED | UNKNOWN
                                                            BLOCKED (any time before DISPATCHING)
```

### 37. UNKNOWN is first class

`UNKNOWN` means the system cannot determine whether the provider accepted the
effect. A client timeout on an `UNSAFE_TO_REPEAT` capability produces
`UNKNOWN`, never a retry. Reconciliation queries provider state through the
capability's reconciliation function and moves the row to `SUCCEEDED` or
`FAILED` with evidence.

### 38. Effect digest and approval binding

Approval-bound effects have a normalised digest over authority-relevant and
content-relevant fields. Changing any bound field after approval invalidates
the approval. Approvals are single-use and expire.

### 39. Dispatch Barrier

The one function through which every external write passes immediately
before the provider call. It checks: capability mode, grants, project,
principal, connection state and epoch, resource, approval digest, budget,
effect state, idempotency constraint, and in-flight conflict.

### 40. In-flight conflict

A unique index on `(connection_id, external_resource_key)` for rows in
`DISPATCHING` or `UNKNOWN` prevents two effects racing on one external
resource. The key is as narrow as correctness allows. `UNKNOWN` holds the key
until reconciliation releases it.

### 41. Single retry owner

The ledger owns retry policy per capability. Adapters, agents and workers do
not retry irreversible effects independently.

### 42. Evidence

Provider IDs, timestamps, response metadata and artifacts are persisted with
the effect when useful for reconciliation or audit.

---

## Part VI — Control Plane and Worker Plane

### 43. Two planes, one code boundary

The Control Plane owns authority, ledger, audit, canonical Knowledge,
scheduling and approvals. The Worker Plane performs inference, sandbox
execution, browser automation and embedding. Workers are invoked through one
internal interface:

```
Worker.run(job: JobEnvelope) → JobResult
JobEnvelope = { run_id, task_id, kind, resource_limits, network_policy,
                capability_refs, inputs }
```

In V1 both planes run in one process on one machine. Placing a worker on
another machine later is an implementation of this interface, not an
architecture change.

### 44. Workers hold no authority

Worker output is evidence input. Workers never write the authority database
and never see provider secrets; they receive capability references and
placeholder-injected credentials (Part VIII).

### 45. One authoritative store

SQLite in WAL mode, written only by the Control Plane. Backups, restores and
audit reason about one file.

### 46. Resource admission

A semaphore per resource class (`MODEL`, `BROWSER`, `SANDBOX`, `EMBEDDING`)
with limits read from the deployment profile (Part XVI). Work beyond capacity
queues; the appliance is never destabilised to run one more task. A memory
reserve for OS, database and UI is enforced before admitting `MODEL` or
`SANDBOX` work.

### 47. Orchestration functions

Planner (decomposes goals into proposed Tasks and Effects; no authority),
Executor (invokes capabilities and adapters), Scheduler (admission and
timing), Approval routing (eligible humans for a given effect),
Reconciliation (per-capability function), Artifact collection (explicit
interface out of sandbox and browser). These are modules in agent-osd, not
services.

### 48. Automations and inbound events

Automations create Runs from schedules or normalised inbound events. They run
as an `AUTOMATION` principal under grants; they never bypass policy. Duplicate
event deliveries are deduplicated by provider event ID before a Run is
created. There is no free-running agent daemon.

---

## Part VII — Agent runtime and Assistants

### 49. Pi

Pi is the general agent runtime. It receives logical capabilities and typed
tool interfaces derived from enabled capabilities in the current project,
never provider secrets or generic provider clients.

### 50. Agent context

May contain: the goal, relevant Knowledge and Skills, prior Step state, tool
results, capability descriptions, Assistant persona and memory. Must not
contain long-lived credentials or another project's data.

### 51. Lifecycle

Agent execution belongs to a Run or Task and can be cancelled or suspended by
the Control Plane. Output is proposal or content until validated.

### 52. Assistants in practice

Users create Assistants in one step: name, project, optional persona. An
Assistant has memory (Part X), is reachable from the dashboard and mobile
web, and shows its standing grants on its card. Deleting an Assistant revokes
its grants.

### 53. Model routing

Pi calls models through the router in Part XI and never through a provider
SDK directly.

---

## Part VIII — Gondolin sandbox

### 54. One sandbox implementation

Gondolin runs coding Tasks and any risky local workload inside a Linux
micro-VM (QEMU; libkrun where available) on every supported host: Raspberry
Pi 5, Mac mini, DGX Spark and other ARM64 or x86_64 Linux/macOS machines.
The isolation class is therefore uniform across the hardware range; a
deployment profile changes sandbox count and memory, not sandbox kind.

### 55. Host is the enforcement point

Filesystem access goes through Gondolin VFS mounts served by the Control
Plane. Network egress goes through Gondolin's HTTP/TLS policy hooks with a
per-Task allowlist. There is no generic NAT.

### 56. Secrets by placeholder

Credentials needed inside a sandbox (for example a short-lived clone token)
are injected as Gondolin placeholders and substituted only on allowed
destinations. Secret bytes never appear in the guest filesystem, environment,
`.netrc`, `.npmrc` or process memory. Tokens are scoped to one Task and
expire with it.

### 57. Repository and branch isolation

Each coding Task works on its own clone or worktree and its own branch. The
default branch is protected. Pushing to a non-default branch is
`LOCAL_WRITE`-class within the sandbox clone and `EXTERNAL_REVERSIBLE` when
pushed; PR creation is a separate capability (Part XIV).

### 58. Artifacts and lifecycle

Artifacts leave through the collection interface. Snapshots may be taken for
recovery and debugging. Ephemeral sandboxes are destroyed after artifacts and
state are persisted.

### 59. Coding browser

Playwright inside Gondolin is available to coding Tasks. It shares nothing
with the product research browser (Part IX).

---

## Part IX — Browser

### 60. browserd

Owns product web-research browser execution with an isolated, unauthenticated
research profile. It is never signed in to Gmail, Calendar, GitHub or any
widget account.

### 61. Read-only research

`web.page.fetch`, `web.page.extract`, `web.search` are read-only. Form
submission that changes state is a separate capability not shipped in V1.
Downloads are quarantined as untrusted artifacts.

### 62. Network policy

Public browsing blocks loopback, RFC1918 and link-local destinations.
Redirect targets are re-evaluated. DNS answers resolving to private addresses
are rejected. Destinations are governed by policy: named domains
`automatic`, open web as an Owner-enabled setting.

### 63. Not a universal adapter

The browser is not a back door to APIs that have governed adapters. No Gmail
or Calendar scraping.

### 64. Failure and evidence

Navigation, extraction and downloads produce timeline evidence. A browser
crash fails the Step without touching Control Plane state.

---

## Part X — Knowledge, memory and learning

### 65. Knowledge

The organisation and project retrieval layer. Canonical sources are stored
separately from derived indexes; indexes can be rebuilt. Retrieval is hybrid
(lexical FTS5 plus local embeddings). Chunks keep provenance. Project A's
Knowledge is not visible to Project B without explicit sharing.

### 66. Local embeddings by default

Embeddings are the inference most likely to leak the whole corpus. They run
locally on every profile; the `lite` profile uses a small CPU model. External
embedding providers are an Owner-enabled exception subject to Part XI.

### 67. Skills

A Skill is a tagged Knowledge document: a procedure the agent or a human
wrote describing how a kind of task is done well here. Agents may write a
Skill after a Run without approval, because a Skill is DATA. Skills are
versioned; humans can edit, promote to `REVIEWED`, or delete them. Skills are
offered to the Planner as context. A Skill never widens authority; every
effect it leads to crosses the Barrier as usual.

### 68. Routines from demonstration

A user can ask an Assistant to watch one execution of a task (dashboard
steps, browser recipe, or a conversation) and save it as a Skill plus an
optional Automation. The Automation runs under grants like any other.

### 69. Memory

Each Assistant has observational memory (summaries of interactions) and
episodic memory (index of prior Runs, decisions, outcomes) scoped to its
project. Users can view, correct and delete memory entries. Remembered
content confers no authority and is treated as DATA.

### 70. Retention and deletion

Retention is configurable. Deleting a canonical source removes its derived
index entries.

---

## Part XI — Models: local, hybrid, API

### 71. Model tiers

The router knows three tiers: `local_small` (always present; embeddings,
classification, cheap drafting), `local_large` (present on `standard` and
`pro` profiles), `external` (API providers, if configured).

### 72. External inference is data egress

Sending a prompt to an external provider sends company data off the machine.
It is therefore a capability, `model.infer.external`, evaluated per project
and per Knowledge source. Knowledge sources can be marked `local_only`; the
router excludes them from external prompts or refuses the request.

### 73. Provider keys are Connections

External model providers are a widget kind (`model_provider`) with
Connections, health checks and epochs like any other provider. Keys never
enter agent context.

### 74. Routing rules

Per project: `local_only`, `hybrid` (local first, external for tasks the
local tier cannot handle, subject to §72), or `external_preferred`. The
deployment profile sets the default (`lite` defaults to `hybrid` because it
has no useful local agent model).

### 75. Weaker models raise friction, not risk

Small local models follow tool schemas less reliably, producing more
`FAILED` and `UNKNOWN` effects and more stop-and-explain. The kernel makes
this safe; the UI should make it legible ("the local model could not complete
this; try again or allow an external model").

---

## Part XII — UI and approvals

### 76. Surfaces

Home (attention items, recent Runs, approvals, Assistants), Work (Projects,
Runs, Tasks, timeline), Apps (widgets: connected, available to project,
actual authority, approval requirement, health, as separate indicators),
Automate, Knowledge, Approvals, Admin (People, Widgets, Policies, Budgets,
Audit, Backup, Updates, System). Home renders from local SQLite summaries
before any provider is contacted; provider refresh is asynchronous and
staleness is shown.

### 77. Recommended `Standard` defaults

```
Gmail      search/read automatic · draft automatic · send ask
GitHub     issue/pr read automatic · pr create ask · comment ask
Calendar   read automatic · create ask · update ask · delete off
Web        named domains automatic · open web: Owner setting
Models     local automatic · external ask (once per project, then grant)
```

### 78. Approval card

Shows exactly the fields that determine what will happen, in plain language,
with a "this sends company data outside the company" line where true, an
expiry, and the grant-from-approval option (§33). Approver eligibility is
evaluated at decision time; a revoked user cannot approve; if no eligible
approver exists the effect shows that state rather than being bypassed.

### 79. Honest state

The UI always distinguishes proposed, running, waiting for approval,
dispatching, unknown, completed and failed. Never "done" without evidence.

### 80. Mobile

Approving, denying, reading a Run and messaging an Assistant work from a
phone via the web UI.

---

## Part XIII — People and roles

### 81. Roles

```
Owner    organisation   governance, policy, widgets, connections, people
Member   organisation   use Assistants and granted capabilities; own USER_OAUTH connections
Auditor  organisation   read-only audit and policy visibility; cannot approve
```

Auditor and Owner are mutually exclusive. There is always at least one Owner;
the last Owner cannot be revoked, suspended or demoted. Manager and Admin are
deferred (Part XIX).

### 82. Principals and auth epochs

```
principals(id, organisation_id, kind, email, display_name, status,
           auth_subject, auth_epoch, created_at, created_by, revoked_at)
role_bindings(id, principal_id, role, granted_by, granted_at, expires_at,
              UNIQUE(principal_id, role))
project_memberships(project_id, principal_id, added_by, added_at,
                    PRIMARY KEY(project_id, principal_id))
```

Revocation or a sensitive auth change increments `auth_epoch`; sessions and
in-flight dispatches carrying an older epoch fail at the Barrier.

### 83. Bootstrap

Create organisation → first HUMAN principal → Owner → default project →
recovery key → commit atomically. No vendor password remains.

### 84. Break-glass

For total Owner authentication loss. Requires host access (physical or
already-authorised SSH) and the recovery key. `agent-os reset-owner` restores
or replaces Owner authentication, is audited, and authorises nothing else.
There is no vendor-side impersonation.

---

## Part XIV — Widgets, V1 catalog

### 85. Widget

A pack of capability descriptors, one adapter, connection kinds, UI card,
health check, risk text and resource needs. V1 widgets live in the appliance
repository and are versioned with the appliance release. Enabling a widget
exposes its capabilities to a project's policy table as `off`; it grants
nothing. Connecting an account grants nothing. Provider scope is a ceiling,
never a source, of authority. Agents cannot install widgets.

### 86. Connection protocol

Connect → DRAFT → provider OAuth/install → verify identity server-side →
store credential in the credential store → CONNECTED → health loop.
Members connect only their own `USER_OAUTH` identities; shared accounts
require an Owner. Revoked users' personal connections are disabled. A shared
connection whose owning Owner is gone becomes `ORPHANED` and cannot dispatch
until reassigned. Health probes never cause external side effects.

### 87. GitHub

Connection: GitHub App installation (PAT as break-glass only). Capabilities:
`repo.issue.read`, `repo.issue.comment`, `repo.pr.read`, `repo.pr.create`,
`repo.pr.request_review`, `repo.webhook.ingest`, `repo.git.clone`.
Repository, installation and branch are CONTROL; issue and PR text are DATA.
Merging to the default branch is not a V1 capability. Signed webhook payloads
remain untrusted text.

### 88. Gmail

Connections: `USER_OAUTH`, `SHARED_ACCOUNT`. Capabilities: `mail.search`,
`mail.read`, `mail.draft`, `mail.send`, `mail.label.read`,
`mail.label.apply`. Sender, recipients, attachment identity and thread target
are CONTROL; body is DATA. `mail.send` is `off` until an Owner sets it;
approval binds sender, recipients, subject, body, attachments, thread target
and draft version. A draft approval never authorises a send. Ambiguous sends
become `UNKNOWN` and are reconciled by message search, never retried.
`mail.send` is the reference `UNSAFE_TO_REPEAT` implementation.

### 89. Google Calendar

Capabilities: `calendar.search`, `calendar.read`, `calendar.create`,
`calendar.update`, `calendar.delete`, `calendar.respond`. Calendar, attendee
identity, event ID and time are CONTROL; title and description are DATA.
Updates bind the provider ETag. Compensation may delete only events this
system created; arbitrary deletion is `off` by default.

### 90. Web Research

Capabilities: `web.page.fetch`, `web.page.extract`, `web.search`,
`web.recipe.run`. Pages and derived summaries are untrusted with retained
provenance. Rules in Part IX apply.

### 91. Model providers

Widget kind `model_provider` (OpenAI-compatible endpoint, Anthropic, local
server). Connection holds the key; capability `model.infer.external` (Part
XI). Local model servers are connections too, so health and routing are
uniform.

---

## Part XV — Audit, credentials, backup, release

### 92. AuditEvent

Policy, role, connection, grant, approval, dispatch, break-glass and update
transitions create append-only AuditEvents correlated to Run, Task, Effect
and principal. Secrets and unnecessary sensitive content are excluded.
Ordinary users and agents cannot mutate history.

### 93. Credential store

Provider credentials live in one encrypted store readable only by the
Control Plane. Agents, sandboxes and browsers see logical connection
references and placeholders. Credentials support rotation and revocation;
revocation bumps the connection epoch and blocks stale dispatches.
Credentials are redacted from logs and artifacts. Minimum provider scopes are
requested.

### 94. Budgets

Per project and per automation: external model tokens, external API calls,
browser minutes, sandbox minutes. Checked at the Barrier and at admission.
Exceeding a budget queues or blocks and is visible on Home.

### 95. Backup and restore

A backup is the SQLite database, configuration, Knowledge canonical sources,
artifacts and the encrypted credential blob with its recovery metadata.
Restore preserves logical IDs. Restored `UNKNOWN` effects are never
redispatched automatically. A backup strategy is incomplete until a restore
has been tested; the Admin Backup page has a "test restore" action.

### 96. Release

The appliance ships as a signed image on a chosen channel. Updates are
downloaded, verified and staged before activation; rollback is supported
where migrations permit. Migrations are explicit and versioned; high-risk
migrations take a pre-migration backup. New capabilities in a release arrive
as `off` in every project.

---

## Part XVI — Deployment profiles

### 97. Profiles are configuration

A profile is a small file that sets memory reserve, semaphore limits, model
tiers and routing default. The logical architecture is identical across
profiles.

### 98. Reference profiles

```
lite       Raspberry Pi 5 class, 8–16 GB, no accelerator
           sandbox 1 · browser 1 · local_large none · embeddings small CPU model
           routing default: hybrid (external for agent reasoning)
           role: full appliance for API/hybrid use, or Control Plane node later

standard   Mac mini M4 / M4 Pro class, 24–64 GB unified memory
           sandbox 2 · browser 1 · local_large ~30B-class quantised
           routing default: local_only or hybrid
           role: the reference solo appliance

pro        DGX Spark class, 128 GB unified memory (~273 GB/s)
           sandbox 4 · browser 2 · local_large up to ~200B NVFP4 MoE
           routing default: local_only
           note: OS, page cache, weights and KV cache share one pool; the
           memory reserve (§46) is the primary admission rule and inference
           utilisation is capped well below the pool size
```

### 99. Gondolin everywhere

Because Gondolin provides the same micro-VM isolation on all three profiles,
the sandbox threat model and the safety tests in Part XVII are identical
across hardware.

---

## Part XVII — Safety properties

V1 tests (must pass before first release):

1. last Owner cannot be revoked, suspended or demoted
2. Auditor cannot approve any effect
3. enabling Gmail does not permit send
4. connecting Gmail does not permit send
5. OAuth scope breadth does not create mail authority
6. mail draft approval cannot authorise send
7. changed approved recipient invalidates approval
8. changed approved body invalidates approval
9. web-derived recipient does not become trusted CONTROL
10. ambiguous Gmail send is never retried; it becomes UNKNOWN and reconciles
11. research browser cannot read any widget credential
12. Gondolin Playwright cannot access browserd profiles
13. sandbox guest never observes secret bytes (placeholder substitution only)
14. open web browsing blocks loopback, RFC1918 and link-local
15. redirects are revalidated; DNS rebinding is blocked
16. Home renders with all providers offline
17. project A authority and Knowledge cannot leak to project B
18. revoked user loses authority immediately; stale sessions fail after epoch change
19. policy narrowing blocks a stale effect; widening does not retroactively authorise
20. connection revoke or ORPHANED state blocks dispatch
21. duplicate webhook deliveries do not duplicate Runs
22. signed webhook payload instructions are not trusted
23. untrusted issue text cannot change target repository or branch
24. calendar attendee cannot be injected from description text
25. stale calendar update (ETag mismatch) does not overwrite
26. compensation cannot delete a pre-existing event
27. a Skill cannot widen authority
28. Assistant memory content cannot become trusted CONTROL
29. `local_only` Knowledge is never included in an external model prompt
30. external model provider key never appears in agent context, sandbox or browser
31. health probes produce no external side effects
32. Owner UI actions still cross the Dispatch Barrier
33. new capabilities in an update arrive as `off`
34. runtime widget installation is impossible
35. external content never becomes CONTROL without an explicit trust transition

Deferred tests (with their features): widget package digest verification,
worker lease and epoch behaviour, shared mailbox by Member, Admin role
limits.

---

## Part XVIII — Build order

```
Phase 1  Kernel
         principals, Owner/Member/Auditor, auth epochs, default project,
         SQLite schema, AuditEvent, credential store, bootstrap, reset-owner

Phase 2  Effect law
         capability registry, policy table + bundles, grants, Effect Ledger,
         digest approvals, Dispatch Barrier, in-flight conflict index,
         reconciliation hook, budgets

Phase 3  Runtime
         agent-osd modules, Worker interface, resource semaphores + profiles,
         Pi with typed tools, Gondolin integration with placeholder secrets,
         model router with local_small + one external provider connection

Phase 4  Product
         dashboard (Home, Work, Approvals, Apps, Admin), mobile web,
         Assistants, Knowledge with FTS5 + local embeddings, Skills as tagged
         documents, Assistant memory

Phase 5  Widgets, in this order
         Gmail read/search → Gmail draft → Gmail send (reference irreversible
         effect) → Calendar → GitHub (App install, clone, PR create) →
         Web Research (named domains) → local_large model tier

Phase 6  Hardening and onboarding
         all V1 safety tests green; onboarding flow demonstrates
         connect → grant → read → approve → dispatch → audit; backup + test
         restore; signed image + staged update

Phase 7  Second wave (each item deferred in Part XIX is a candidate)
```

---

## Part XIX — Deferred (roadmap, not V1)

- Manager and Admin roles; per-project role matrix; `SERVICE` principals
- Four-level autonomy (L0–L3); autonomy is currently `off | ask | automatic` + grants
- Policy engine with draft / validate / semantic diff / publish snapshots
- Independently versioned, signed widget packages with per-widget rollback
- Third-party or MCP-transported adapters (MCP would still sit behind the Barrier)
- Cluster deployment: worker leases, node identity, placement, PostgreSQL
- Chat channels (Slack, Telegram, WhatsApp) as inbound events and approval surfaces
- Shared mailboxes for Members; richer GitHub installation management
- Open-web form submission and downloads beyond quarantine
- A tighten-only risk-review model that can escalate to `ask` but never loosen policy
- Skill lifecycle states beyond `UNREVIEWED` / `REVIEWED`
- Full trust-class lattice (`TRUSTED_CONTROL`, `TRUSTED_DATA`, `UNTRUSTED_TEXT`,
  `UNVERIFIED_EXTERNAL`, `DERIVED_FROM_UNTRUSTED`); V1 uses `trusted` flag + provenance
- Teach / Stagehand style browser recipe learning beyond §68
- Notification channels beyond dashboard and mobile web
- Timed break-glass ceremony; V1 is `reset-owner` with recovery key

---

## Part XX — Implementer checklist

Before shipping a feature, answer:

1. Is this a surface, an authority, or a provider ceiling?
2. Did enabling or connecting anything accidentally create authority?
3. Which fields are CONTROL, and can untrusted DATA alter them?
4. Which policy row and grants are checked at dispatch?
5. What happens after policy narrowing, connection revocation, or epoch bump?
6. What happens if the provider response is lost? Is retry actually safe? How is UNKNOWN reconciled?
7. What conflict key protects the external resource?
8. Which runtime executes this (Control Plane, Pi, Gondolin, browserd), and what can it see?
9. Does any company data leave the machine, including via a model prompt?
10. Can a Skill, memory entry or webpage make this happen without a human transition?
11. Does the SQLite schema enforce the invariant, or only the code?
12. Which safety test covers it?

If any answer is unclear, the feature is not ready.

---

## Part XXI — Closing

Agentic OS Edge is a governed execution system, not an autonomous root
agent. Humans govern. Policy defines authority. Assistants propose. Approvals
bind exceptional authority. The Dispatch Barrier decides whether an effect
may leave. Adapters talk to providers. The Effect Ledger records what was
attempted. Reconciliation determines what happened. Artifacts and Audit keep
the evidence. Skills and memory make the system better at proposing without
ever making it more authorised.

```
visible ≠ authorized
enabled ≠ authorized
connected ≠ authorized
OAuth-scoped ≠ authorized
role ≠ agent capability
drafted ≠ approved to send
approved ≠ dispatched
dispatched ≠ known-success
timeout ≠ safe-to-retry
external text ≠ CONTROL
model output ≠ trust upgrade
remembered ≠ trusted
learned skill ≠ granted authority
external inference ≠ local
owner ≠ root
browser ≠ universal adapter
widget ≠ kernel
```

Everything may propose. Only explicit authority may decide. Only the
Dispatch Barrier may let an external effect leave. After it leaves,
evidence, not optimism, determines what happened.
