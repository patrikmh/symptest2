# Agentic OS Edge — Canonical Architecture Specification v6.1

Status: production architecture baseline (supersedes v6.0 and v5.6)
Target: private, self-hosted agentic operating system for small and mid-sized organisations
Deployment: one appliance (Raspberry Pi 5, Mac mini, DGX Spark or equivalent); optional worker machines later
Core loop: Propose → Decide → Do → Prove
Knowledge graph: Graphiti (self-hosted; never Zep Cloud)

Normative words: MUST, MUST NOT, SHOULD, MAY have their usual meaning.
Anything not marked V1 in Part XXI is roadmap.

## Revision note

v6.1 adopts Graphiti as the V1 knowledge and memory graph. SQLite remains
the sole authority store. Graphiti is a derived, rebuildable index. Graph
facts are DATA and never CONTROL. Graphiti's extraction LLM is called only
through the model router. The graph backend is embedded FalkorDB Lite on
solo appliances; Neo4j/Neptune/Kuzu are not V1.

v6.0 kept the v5.6 security kernel and removed what a first customer on one
machine does not need. That kernel is unchanged.

Kept: Propose → Decide → Do → Prove; CONTROL vs DATA; Effect Ledger with
first-class UNKNOWN; Dispatch Barrier; digest-bound approvals; credential
isolation; browser isolation; no vendor root; evidence over claims; the
safety-test discipline.

Added in v6.0: Control Plane / Worker Plane as a code boundary; Assistants;
Skills and memory without authority; model routing; Gondolin on all
hardware; three deployment profiles; explicit V1 build order.

Added in v6.1: Graphiti as the temporal knowledge graph (Part X); graph
search as hybrid retrieval; ingest as a `GRAPH_INGEST` worker job;
`group_id` = project; fallback FTS5 when the graph is rebuilding;
Graphiti-specific safety tests. Sections are numbered 1–192 with no gaps.

Simplified (still): Owner/Member/Auditor; `off | ask | automatic` plus
grants; policy as an audited table; in-repo widgets; SQLite as the
authority database; one-command break-glass.

---

# Part I — Law

## 1. Purpose

Agentic OS Edge turns a company-owned machine into a governed agentic
environment. It combines AI assistants, automation, company knowledge, coding
sandboxes, web research and external integrations. Company data stays on
company hardware. The model is never a trusted authority.

## 2. Promise

A user states a goal in ordinary language. The system plans the work,
retrieves evidence, delegates to agents, asks for approval when policy
requires it, executes, verifies the outcome and preserves evidence. A company
with no IT department MUST be able to install it, connect one account and
complete a governed task within an afternoon.

## 3. Logical architecture

```
Humans
  ↓
Presentation      dashboard, mobile web
  ↓
Control Plane     authority, Effect Ledger, audit, canonical Knowledge, Graphiti ingest queue, scheduling, approvals
  ↓
Worker Plane      model inference (including Graphiti extraction), Gondolin, browserd, embeddings
  ↓
Stores            SQLite (authority) · Graphiti/FalkorDB Lite (derived graph) · artifact files
  ↓
Adapters          one per widget
  ↓
External systems  Gmail, Calendar, GitHub, the web, model providers
```

Every external effect crosses the Control Plane. Nothing in the Worker Plane
or Presentation layer may reach an external system directly. Graphiti never
calls a provider, never writes SQLite authority tables, and never talks to
Zep Cloud.

## 4. Primary invariant

Agents may propose. Agents possess no inherent authority. Authority comes
only from published policy, grants and approvals.

## 5. Propose → Decide → Do → Prove

Every meaningful external effect passes four stages in order. Planning and
model output belong to PROPOSE. Policy and approval belong to DECIDE.
Provider interaction belongs to DO. Evidence belongs to PROVE. Text from an
agent claiming completion is never evidence.

## 6. The model is an untrusted I/O device

Models MAY interpret, reason, transform, draft and suggest tool calls. Models
MUST NOT determine whether a capability is authorised, and model output MUST
NOT raise the trust level of any value.

## 7. Modular monolith

The Control Plane is one process (`agent-osd`) with internal modules.
Modules MUST NOT be split into network services for symmetry. Network
boundaries exist only where the other side is unreliable or untrusted:
providers, the browser, sandboxes, webhook senders, external model APIs, and
(later) worker machines.

## 8. Private by default

The appliance MUST be fully functional with no vendor cloud reachable. Company
data leaves the machine only through a configured provider and a governed
effect. Sending a prompt to an external model provider is such an effect
(Part XI).

## 9. Least authority

Each action receives only the authority it needs. There MUST be no ambient
credential, no globally reusable tool handle and no generic provider client
in agent reach.

## 10. No hidden root

Administration is explicit and performed by identified humans. There is no
permanent vendor principal, standing vendor SSH key or vendor impersonation
path. The vendor cannot read customer Knowledge or connected accounts.

## 11. Evidence over claims

A task is complete when the system holds evidence: a provider object ID, an
API response, a file artifact, a Git commit, a test result, a screenshot,
database state.

## 12. Safe failure and recoverability

When authority or effect state is ambiguous the system MUST stop and explain
rather than guess and mutate. Rare failures need not be impossible if they
are detected, contained, explained and recoverable. Do not buy impossibility
with complexity.

## 13. Irreversible effects last

Within a workflow that mixes reversible and irreversible steps, irreversible
external effects SHOULD occur as late as possible.

## 14. Safety properties are executable

Every invariant in this document that can be tested MUST exist as a test
(Part XX). An invariant without a test is a wish.

---

# Part II — Domain model

## 15. Organisation

The top-level governance boundary. One per appliance in V1. All principals,
projects, policy, connections and audit belong to it.

## 16. Project

A collaboration and authority boundary inside the organisation. A Project
holds members, Assistants, Runs, Knowledge, Automations, grants, policy rows
and artifacts. V1 creates a default project that every member belongs to;
additional projects are optional and isolate Knowledge and authority.

## 17. Principal

An identity that participates in policy evaluation. V1 kinds: `HUMAN`,
`AUTOMATION`. Every Run has exactly one initiating principal.

## 18. Assistant

A named, persistent teammate a user talks to. An Assistant is:

- a persona (name, instructions, tone)
- a memory scope (Part X)
- a home project
- zero or more standing grants shown on its card

An Assistant never runs as a daemon. Every action it takes is a Run, and its
authority is exactly the union of the initiating human's project membership
and the Assistant's grants, evaluated at dispatch.

## 19. Run

One execution of a goal, an Automation firing or an inbound event. The Run is
the primary unit in Work and the anchor for timeline, artifacts, effects and
audit correlation.

## 20. Task and Step

A Run MAY contain Tasks: bounded units for an agent or a deterministic worker.
A Task MAY contain Steps: meaningful checkpoints. Sandboxes, browser sessions
and worker jobs are always attached to a Task.

## 21. Effect

A proposed or attempted state change outside pure reasoning, e.g.
`mail.send`, `calendar.create`, `repo.pr.create`, `file.write`,
`model.infer.external`. Effects live in the Effect Ledger (Part V).

## 22. Artifact

Durable evidence or output with provenance: file, diff, report, screenshot,
extracted page, structured result, provider response. Artifacts survive
sandbox and browser destruction.

## 23. Approval

A human decision bound to the digest of one exact proposed effect, or to one
bounded grant request. Single-use, expiring.

## 24. Capability

A typed operation policy can evaluate, namespaced by domain: `mail.*`,
`calendar.*`, `repo.*`, `web.*`, `knowledge.*`, `model.*`, `file.*`.
`knowledge.search`, `knowledge.get_source`, `knowledge.write` and
`knowledge.suggest_correction` are kernel capabilities, not a widget pack.

## 25. Grant

Authorisation of a capability under explicit constraints: project,
connection, resource, principal or automation, CONTROL value constraints,
expiry.

## 26. Connection

Technical provider access: an OAuth identity, a GitHub App installation, an
API key, a local model server endpoint. A Connection is reach, not
permission.

## 27. Skill

A project-scoped, versioned procedure in natural language or a simple step
format, with provenance. A Skill is DATA and carries no authority (Part X).
Skills are canonical SQLite rows that are also ingested as Graphiti
episodes so the Planner can retrieve them by relationship as well as by
search.

## 28. Graphiti

Graphiti is the temporal knowledge graph engine. It stores episodes,
entities and bi-temporal facts derived from canonical sources. It is not
an authority store, not a policy store, and not an effect ledger. See
Part X.

## 29. Widget

A pack that brings a provider into the system: capability descriptors, one
adapter, connection kinds, a UI card, health check, risk text and resource
needs (Part XV).

---

# Part III — Trust

## 30. CONTROL vs DATA

CONTROL determines what an action targets: recipient, sender, calendar,
attendee, event ID, repository, branch, installation, URL, destination
domain, model provider. DATA is the content the action carries: body,
subject, title, description, issue text, code, summary.

## 31. Trusted CONTROL

Every CONTROL field on an effect carries `trusted: boolean` and a provenance
reference. A CONTROL value becomes trusted only through an explicit
transition:

- a human typed or selected it in the UI
- it matches a policy allowlist or a grant constraint
- a human approved it on an approval card that displayed it

The Dispatch Barrier MUST reject any effect with an untrusted CONTROL value.

## 32. External content is adversarial

Email, issues, PR text, webpages, documents, webhook bodies, calendar
descriptions and anything a model derived from them are untrusted. Prompt
injection is an expected property of such content. An instruction inside
untrusted content grants nothing and targets nothing.

## 33. No trust upgrade by transformation

Parsing into JSON, extraction by a model, summarisation, translation, or a
valid webhook signature does not make content trusted. Tool schemas constrain
syntax, not authority.

## 34. Memory, Skills and graph facts are DATA

Remembered facts, learned procedures, Graphiti entities and Graphiti edges
are untrusted for CONTROL purposes. "Last time we sent this to alice@…"
and a graph edge `alice --[email]--> alice@example.com` do not make that
address a trusted recipient. Graphiti extraction is model output and
MUST NOT raise trust (§6, §33).

## 35. Provenance

Artifacts and Knowledge chunks MUST retain: source identity and location,
retrieval time, producing Run and Task, producing model or tool, and the
transformation chain. Derived content inherits the lowest trust of its
inputs.

## 36. Webhooks

Signature verification proves the sender, not the safety of the payload.
Payloads are normalised into internal event records, deduplicated by provider
event ID, and treated as untrusted text.

## 37. Downloads

Files fetched by the browser or a sandbox are quarantined artifacts. They are
never executed on the host and are opened inside a sandbox only when a Task
requires it.

---

# Part IV — Capabilities and policy

## 38. Capability descriptor

Each capability declares:

```
name                  mail.send
widget                gmail
risk_class            READ | LOCAL_WRITE | EXTERNAL_REVERSIBLE | EXTERNAL_IRREVERSIBLE
idempotency           PURE | IDEMPOTENT | RECONCILIABLE | UNSAFE_TO_REPEAT
control_schema        fields that are CONTROL
data_schema           fields that are DATA
resource_selector     how the external resource key is derived
reconcile(effect)     function that determines outcome from provider state
on_unknown            RECONCILE | FAIL | HOLD
compensation          optional; narrower than general delete
leaves_company        boolean, for disclosure
```

A capability with `EXTERNAL_IRREVERSIBLE` MUST be `RECONCILIABLE` or
`UNSAFE_TO_REPEAT` and MUST define `reconcile`.

## 39. Policy is a table

```
policy_rules(project_id, capability, mode, updated_by, updated_at)
  mode ∈ { off, ask, automatic }

grants(id, capability, project_id, connection_id,
       subject_kind, subject_id,            -- HUMAN | AUTOMATION | ASSISTANT
       control_constraints_json, granted_by, granted_at,
       expires_at, revoked_at)
```

- `off`: the capability is not offered to agents in the project.
- `ask`: every effect requires an approval.
- `automatic`: policy alone suffices; CONTROL values must still be trusted.

A grant narrows `ask` to `automatic` for effects whose CONTROL values satisfy
`control_constraints_json`. Every change to either table is an AuditEvent.
There is no separate draft/publish engine in V1.

## 40. Defaults on enablement and update

When a widget is enabled or a release adds a capability, the capability
appears in every project as `off`. Nothing gains authority by appearing.

## 41. Policy bundles

Onboarding offers three bundles that fill `policy_rules` for the default
project: `Cautious`, `Standard`, `Trusting`. `Standard` is defined in §133.
Owners edit rows afterwards from Admin → Policies, one row at a time, with a
plain-language description of what changes.

## 42. Grant-from-approval

When a human approves an `ask` effect, the card offers: "Allow this
automatically when [narrowed CONTROL] for [7 / 30 / 90 days]". The
narrowing is derived from the effect (e.g. recipients within `@ourdomain`,
this repository, this calendar). Accepting creates a grant through the normal
path with an AuditEvent. This is the mechanism that keeps approval volume
tolerable without loosening policy globally.

## 43. Current policy wins

Authority is evaluated at dispatch, not at proposal. Policy narrowing blocks
stale effects. Policy widening never retroactively authorises an effect that
was denied.

## 44. Roles are not agent capabilities

A human role (Part XIV) governs what the human may see and administer. It
grants nothing to agents.

## 45. Project isolation

Policy rows, grants, connections exposed to a project, Knowledge and
Assistant memory are project-scoped. Nothing from Project A is available in
Project B without an explicit sharing action by an Owner.

## 46. Budgets

Per project and per automation: external model tokens, external API calls,
browser minutes, sandbox minutes, per day and per month. Budgets are checked
at admission and at the Dispatch Barrier. Exceeding a budget queues or blocks
and is visible on Home. Budgets never widen authority.

## 47. Capability registry

The set of capabilities available to an agent in a Run is derived from:
enabled widgets → project policy rows not `off` → connections exposed to the
project → budgets. Tool definitions handed to Pi are generated from this set
and nothing else.

---

# Part V — Effect lifecycle

## 48. Effect Ledger

Every externally meaningful effect is a row:

```
effects(id, run_id, task_id, capability, project_id, principal_id,
        connection_id, connection_epoch, control_json, data_ref,
        digest, state, approval_id, external_resource_key,
        provider_object_id, evidence_ref, policy_version,
        created_at, updated_at, attempt_count, last_error_class)
```

## 49. States

```
PROPOSED           created by the Planner; no authority checked
PREPARED           CONTROL and DATA complete; digest computed
WAITING_APPROVAL   mode is ask and no matching approval exists
BLOCKED            Barrier refused; reason recorded; terminal unless re-proposed
DISPATCHING        provider call may have begun
SUCCEEDED          provider evidence shows the effect occurred
FAILED             provider evidence shows it did not; retry policy known
UNKNOWN            outcome cannot be determined; awaiting reconciliation
```

## 50. UNKNOWN is first class

`UNKNOWN` means the system cannot determine whether the provider accepted the
effect. A client timeout, a lost response or a crash during `DISPATCHING`
produces `UNKNOWN`. For `UNSAFE_TO_REPEAT` capabilities `UNKNOWN` MUST NOT
lead to a retry. Reconciliation calls the capability's `reconcile` function,
which queries provider state (e.g. searches for the sent message) and moves
the row to `SUCCEEDED` or `FAILED` with evidence. If reconciliation cannot
decide, the row stays `UNKNOWN`, is shown to a human, and holds its conflict
key.

## 51. Effect digest

Approval-bound effects have a normalised digest over all CONTROL fields and
all content-relevant DATA fields as defined by the capability. The digest is
recomputed at the Barrier; mismatch with the approval's digest is a block.

## 52. Approval binding

An approval references one effect ID and one digest. It is single-use and
expires (default 24 hours, per-capability override). Changing any bound field
after approval invalidates the approval and returns the effect to
`WAITING_APPROVAL`.

## 53. Dispatch Barrier

One function through which every external write passes immediately before
the provider call. It evaluates, in order, and blocks on the first failure:

1. effect state is `PREPARED` or `WAITING_APPROVAL` with a valid approval
2. capability exists and is not `off` in the project
3. every CONTROL field is trusted
4. initiating principal is active and its auth epoch is current
5. connection is `CONNECTED`, exposed to the project, and its epoch matches the effect
6. mode is `automatic`, or a grant matches the CONTROL values, or a matching non-expired approval exists
7. digest matches approval (if any)
8. budgets permit
9. no conflicting row holds the external resource key
10. idempotency constraint allows this attempt

The Barrier records the policy version and connection epoch it evaluated on
the effect. There is no bypass, including for Owners acting from the UI.

## 54. In-flight conflict

A unique index on `(connection_id, external_resource_key)` over rows in
`DISPATCHING` or `UNKNOWN` prevents two effects racing on one external
resource. The key is as narrow as correctness allows (a thread, an event, a
PR), never "the mailbox". `UNKNOWN` holds the key until reconciliation
releases it.

## 55. Single retry owner

The ledger owns retry per capability. `PURE` and `IDEMPOTENT` capabilities
may retry with backoff. `RECONCILIABLE` capabilities reconcile before any
retry. `UNSAFE_TO_REPEAT` capabilities never retry automatically. Adapters,
agents and workers MUST NOT retry on their own.

## 56. Evidence

Provider IDs, timestamps, response metadata and artifacts are persisted with
the effect. Evidence is what the UI shows as "done".

## 57. Compensation

Where a capability defines compensation, it applies only to state this
system created (e.g. delete an event this system created). Compensation is a
new effect that crosses the Barrier; it is never implicit.

## 58. Restore safety

After a backup restore, effects in `DISPATCHING` become `UNKNOWN` and are
reconciled, never redispatched.

## 59. Disable safety

Disabling a widget blocks new dispatch for its capabilities immediately,
leaves existing external objects untouched, and leaves `UNKNOWN` rows for
reconciliation only.

## 60. Effect timeline

Each state transition, Barrier decision and reconciliation result is a
timeline entry on the Run, visible in Work and, in detail, in the Inspector.

## 61. Reference implementation

`mail.send` is the reference `EXTERNAL_IRREVERSIBLE` / `UNSAFE_TO_REPEAT`
capability. Every later irreversible capability copies its ledger handling.

---

# Part VI — Control Plane and Worker Plane

## 62. Two planes

The Control Plane owns authority, the Effect Ledger, audit, canonical
Knowledge sources, the Graphiti ingest queue, scheduling, approvals and the
credential store. The Worker Plane performs model inference (including
Graphiti entity/edge extraction), sandbox execution, browser automation and
embedding computation. Graphiti's graph store is a derived index owned by
the Control Plane as the single writer; workers only produce extraction
results that the Control Plane commits.

## 63. One interface

```
Worker.run(job: JobEnvelope) → JobResult

JobEnvelope {
  run_id, task_id, kind: MODEL | SANDBOX | BROWSER | EMBEDDING | GRAPH_INGEST,
  resource_limits, network_policy, capability_refs,
  credential_placeholders, inputs
}
JobResult { status, outputs, artifacts, evidence, error_class }
```

In V1 both planes run in one process on one machine. Running a worker on
another machine is a later implementation of this interface, not a change to
the architecture.

## 64. Workers hold no authority

Worker output is evidence input. Workers never write the authority database,
never hold provider secrets (only placeholders, §87), and never call the
Dispatch Barrier. Tool calls proposed by an agent inside a worker return to
the Control Plane as proposals.

## 65. Two stores, one authority

SQLite in WAL mode, written only by the Control Plane, is the authoritative
store for principals, policy, grants, effects, audit, canonical Knowledge
sources, Skills and Assistant memory rows.

Graphiti's graph (FalkorDB Lite file in V1) is a derived store. It MAY be
wiped and rebuilt from canonical sources. It MUST NOT be the only copy of
any fact the product depends on. The Control Plane is the single writer to
the graph file (FalkorDB Lite is single-process).

Schema constraints on SQLite enforce invariants where SQLite can
(uniqueness, foreign keys, check constraints); application code enforces
the rest and tests cover both.

## 66. Resource admission

A semaphore per resource class (`MODEL`, `BROWSER`, `SANDBOX`, `EMBEDDING`,
`GRAPH_INGEST`) with limits from the deployment profile (Part XIX).
`GRAPH_INGEST` shares the model semaphore in practice (extraction is an LLM
call) but is queued behind interactive Runs so ingest cannot starve the UI. A memory reserve for OS,
database and UI is checked before admitting `MODEL` or `SANDBOX` work. Work
beyond capacity queues with a visible reason; the appliance is never
destabilised to run one more task.

## 67. Orchestration modules

Inside `agent-osd`:

- Planner: decomposes goals into proposed Tasks and Effects. No authority.
- Executor: runs Tasks via workers and adapters.
- Scheduler: admission, ordering, timers.
- Approval routing: selects eligible humans for an effect (Part XIII).
- Reconciliation: runs `reconcile` functions on `UNKNOWN` rows on a schedule and on demand.
- Artifact collection: the only path for outputs out of sandboxes and browsers.
- Event intake: normalises and deduplicates inbound events.
- Graph ingest: dequeues canonical writes, runs Graphiti `add_episode` via a worker, commits as the single graph writer.

## 68. Automations

An Automation is a schedule or event trigger that creates Runs under an
`AUTOMATION` principal with grants. Automations never bypass policy. Users
see every Automation's standing grants in Automate and on Home.

## 69. No free-running agents

There is no agent process that persists outside a Run. Long-lived behaviour
exists only through Automations and Assistants (whose memory persists but
whose execution does not).

## 70. Cancellation

The Control Plane can cancel or suspend any Task; cancellation destroys the
sandbox or browser session after artifact collection and leaves in-flight
effects to the ledger.

## 71. Health

The Control Plane exposes local health for itself, SQLite, the Graphiti
backend, each worker class and each connection. Health probes MUST NOT
cause external side effects. Graphiti health is "file open, query a known
node"; it MUST NOT call an LLM.

---

# Part VII — Agent runtime and Assistants

## 72. Pi

Pi is the general agent runtime. It receives typed tool interfaces derived
from the capability registry (§47) for the current Run, never provider
secrets or generic provider clients.

## 73. Agent context

MAY contain: the goal, Assistant persona, relevant Knowledge, Graphiti
search hits (tagged DATA, `trusted: false`), Skills, Assistant memory, prior
Step state, tool results, capability descriptions. MUST NOT contain
long-lived credentials, another project's data, Graphiti admin handles, or
content marked `local_only` when an external model is the target (Part XI).

## 74. Tool calls are proposals

A tool call that would produce an external effect creates a `PROPOSED`
effect. The agent receives the ledger outcome (including `WAITING_APPROVAL`
and `UNKNOWN`) as a structured result and must plan around it. Read
capabilities return data with provenance tags.

## 75. Lifecycle

Agent execution belongs to a Run or Task, is admitted through resource
semaphores, and can be cancelled or suspended. Output is proposal or content
until the relevant subsystem validates it.

## 76. Reviewer agents

A Task MAY include a reviewer agent that inspects another agent's work. A
reviewer may only tighten: it can flag, block or request approval; it can
never authorise. (A dedicated risk model is deferred, Part XXII.)

## 77. Concurrency

Multiple agents run concurrently when their effect resource keys and
sandboxes do not conflict. Conflicts are resolved by the ledger index, not by
agents negotiating.

## 78. Assistants in practice

Creating an Assistant is one step: name, home project, optional
instructions. It appears on Home, is reachable from the dashboard and mobile
web, shows its standing grants and recent Runs on its card, and can be paused
or deleted. Deleting an Assistant revokes its grants and archives its memory.

## 79. Assistant authority

An Assistant's effective authority in a Run is: project policy rows ∩
(initiating human's membership ∪ Assistant grants) ∩ connection exposure ∩
budgets, evaluated at dispatch. Talking to an Assistant with more grants does
not give the human more UI rights; a human with more rights does not give the
Assistant more grants.

## 80. Model routing from Pi

Pi calls models only through the router (Part XI). It cannot select a
provider directly; it may request a tier ("needs strong reasoning") and the
router applies project policy.

## 81. Failure legibility

When a Task fails because the model could not follow a tool schema or
produced an unusable plan, the Run shows that plainly ("the local model could
not complete this; retry, or allow an external model for this project")
instead of a generic error.

---

# Part VIII — Gondolin sandbox

## 82. One sandbox implementation

Gondolin runs coding Tasks and any risky local workload inside a Linux
micro-VM (QEMU by default; libkrun where available) on every supported host:
Raspberry Pi 5, Mac mini, DGX Spark and other ARM64 or x86_64 Linux/macOS
machines. Isolation class is therefore uniform across the hardware range. A
deployment profile changes sandbox count and memory, not sandbox kind.

## 83. Host is the enforcement point

The guest sees `eth0` and a filesystem, but egress is mediated by Gondolin's
host-side HTTP/TLS policy hooks and files under mounted paths are served by
host VFS providers. There is no generic NAT and no host filesystem
passthrough.

## 84. Per-Task network policy

Each sandbox Task carries a network allowlist derived from its capability
references (e.g. the GitHub host for a clone, a package registry for a
build). Everything else is denied and logged as evidence.

## 85. Per-Task filesystem

Mounts are explicit: the Task's repository clone or worktree, a scratch
directory, and read-only inputs. Host paths, other projects' data and the
credential store are never mounted.

## 86. Repository and branch isolation

Each coding Task works on its own clone or worktree and its own branch. The
default branch is protected on the provider side and never targeted by a
sandbox push. Pushing to the Task branch is `EXTERNAL_REVERSIBLE`; opening a
PR is a separate capability (§167).

## 87. Secrets by placeholder

Credentials a sandbox needs (a short-lived clone token, a registry token) are
injected as Gondolin placeholders and substituted by the host only on allowed
destinations. Secret bytes MUST NOT appear in the guest filesystem,
environment, `.netrc`, `.npmrc`, `.git-credentials` or process memory. Tokens
are scoped to one Task and expire with it.

## 88. Artifacts

Diffs, test results, build logs and files leave only through the artifact
collection interface and are persisted with provenance before the sandbox is
destroyed.

## 89. Snapshots

A sandbox MAY be snapshotted for recovery or debugging. Snapshots are
artifacts with retention and never contain secret bytes (by §87).

## 90. Destruction

Ephemeral sandboxes are destroyed after artifact collection. A crashed
sandbox fails its Step; the Control Plane is unaffected.

## 91. Coding browser

Playwright inside Gondolin is available to coding Tasks (e.g. testing a web
app). It shares no profile, cookie, credential or network policy with
browserd (Part IX). It cannot reach the appliance's own UI or private
networks unless the Task's network policy explicitly allows a local test
server inside the sandbox.

---

# Part IX — Browser

## 92. browserd

`browserd` owns product web-research browser execution. It runs an isolated,
unauthenticated research profile. It is never signed in to Gmail, Calendar,
GitHub or any widget account, and it never receives provider OAuth material.

## 93. Separate resource class

Browser work is admitted through the `BROWSER` semaphore. Under memory
pressure browser Tasks queue.

## 94. Read-only research

`web.page.fetch`, `web.page.extract` and `web.search` are read-only.
Navigation, scrolling, and reading are allowed. Form submission that changes
state, uploads, logins and payments are not capabilities in V1.

## 95. Network policy

- Named domains from policy or grants: `automatic`.
- Open web: an Owner setting per project (`web.open_read`).
- Loopback, RFC1918, link-local and the appliance's own addresses are blocked
  regardless of setting.
- Redirect targets are re-evaluated against the same policy.
- DNS answers resolving to private addresses are rejected (rebinding).

## 96. Downloads

Downloads are quarantined artifacts (§37). They are never executed and are
opened only inside a Gondolin sandbox when a Task requires it.

## 97. Recipes

`web.recipe.run` executes a checkpointed sequence of read-only navigation and
extraction steps saved as a Skill (§111). Recipes obey the same network
policy as ad-hoc browsing.

## 98. Not a universal adapter

The browser MUST NOT be used to reach a provider that has a governed adapter.
There is no Gmail, Calendar or GitHub scraping.

## 99. Evidence

Navigation, extraction and downloads produce timeline entries and, where
useful, screenshots as artifacts. Extracted content is
`UNVERIFIED_EXTERNAL` with provenance.

## 100. Failure

A browser crash fails the current Step and destroys the session. Control
Plane state is unaffected.

## 101. Profiles for future authenticated widgets

If a future widget needs an authenticated browser profile, it gets its own
profile, its own capability namespace and its own policy rows. It never
shares a profile with research or with any other widget.

---

# Part X — Knowledge, Graphiti, memory and learning

## 102. Two layers

Knowledge has a canonical layer and a derived layer.

**Canonical (SQLite):** uploaded files, saved pages, Skill documents,
Assistant memory rows, Run summaries the product has chosen to keep. These
survive graph rebuilds.

**Derived (Graphiti):** episodes, entity nodes, bi-temporal edges,
community summaries. Rebuildable at any time from canonical sources plus
ingest logs. Losing the graph file is an operational incident, not data
loss.

FTS5 over canonical SQLite remains the fallback search path. Home and
Knowledge MUST still answer from FTS5 if Graphiti is rebuilding or
unhealthy.

## 103. Graphiti is the graph engine

V1 uses the Graphiti library (`graphiti-core`) in-process. It MUST NOT
call Zep Cloud, MUST NOT default to OpenAI, and MUST NOT be given a
generic provider client. Its LLM client and embedder are the model router
(Part XI). Its graph driver in V1 is FalkorDB Lite (embedded file,
Python 3.12+, Linux and macOS).

Forbidden V1 backends: Amazon Neptune (data leaves the appliance), Kuzu
(deprecated upstream), Neo4j server (extra process; MAY be a profile
override later, not the default). FalkorDB server MAY be used on `pro` if
Lite is insufficient; it is still local.

## 104. Partitioning

```
group_id = project_id          for project Knowledge, Skills, Assistant memory, Run episodes
group_id = org:<organisation_id>  for organisation Knowledge
```

Search, ingest and delete are always scoped to one `group_id`. A query
from Project A MUST NOT return nodes from Project B. Sharing copies
canonical sources into the destination project and re-ingests; it does
not union `group_id`s at query time.

## 105. Episode ingest

Canonical writes enqueue an ingest job. The Control Plane calls
`add_episode` with:

```
name              source type + id
episode_body      canonical text (or a bounded excerpt)
source            text | json | message
reference_time    when the fact occurred (email date, Run time, document date)
                  never "now" for historical material
group_id          as §104
source_description  SQLite source id, Run id, producing model tier
```

Extraction (entities, edges, invalidation) is a `GRAPH_INGEST` worker job
that uses the model router. It is subject to `model.routing`,
`model.infer.external`, `local_only`, and budgets. If the router refuses
or the local model cannot produce structured output, the episode is stored
as raw text only (searchable via FTS5 and as an `EpisodicNode` without
edges) and the Run or Knowledge item is not blocked.

Graphiti's OpenAI default client MUST be overridden at construction. There
is no code path that reads `OPENAI_API_KEY` for Graphiti unless that key
belongs to a configured `model_provider` Connection and policy permits
external inference.

## 106. Bi-temporal facts

Edges use Graphiti's timestamps:

```
valid_at     when the fact was true in the world
invalid_at   when it stopped being true
created_at   when this system ingested it
expired_at   when this system superseded it
```

Contradictions invalidate; they do not delete. Point-in-time search
("what did we believe about the vendor on the day of this approval?") is
supported and remains DATA. The Effect Ledger, not the graph, is
authoritative for whether an effect dispatched.

## 107. Retrieval

The Planner and Pi `knowledge.search` tool run Graphiti hybrid search
(semantic + BM25 + graph-distance rerank) inside the Run's `group_id`,
then merge FTS5 hits from canonical SQLite. Every hit carries provenance:
source id, episode id, edge id, `valid_at`, producing model tier, and
`trusted: false`.

Pi MUST NOT receive a Cypher endpoint or a generic Graphiti admin client.
Tools are `knowledge.search`, `knowledge.get_source`, and
`knowledge.suggest_correction`.

## 108. Local embeddings by default

Graphiti embeddings use `local_small` on every profile. An external
embedding Connection is an Owner-enabled exception, subject to Part XI and
`local_only`. `local_only` sources MUST NOT be sent to an external
embedder or to Graphiti extraction that would call `model.infer.external`.

## 109. `local_only`

Any canonical source can be marked `local_only`. Ingest of that source
MUST use a local model tier. If no local extractor can run, ingest stops
at the raw episode and the UI shows "indexed for search, not graphed".

## 110. Correction and deletion

Users correct graph facts from Knowledge UI. A correction is a new
canonical row plus a new episode; Graphiti's invalidation updates the
edge. Deleting a canonical source deletes its SQLite row, removes FTS5
entries, and deletes Graphiti nodes/edges for that episode by uuid /
group. Users can also expire an edge without deleting the source.

Agents MAY propose a correction (`knowledge.suggest_correction`); applying
it is a human or `automatic` Knowledge-write according to policy. Agent
proposals never write the graph directly.

## 111. Skills

A Skill is a tagged canonical document (§27). Ingest creates a Skill
entity and `used_in` / `depends_on` edges when the episode text declares
them. The Planner retrieves Skills by Graphiti search and by FTS5. A Skill
never widens authority. Agents MAY write a Skill after a Run without
approval because a Skill is DATA. Humans can edit, delete, or mark
`REVIEWED`.

## 112. Routines from demonstration

A user can ask an Assistant to watch one execution and save it as a Skill,
optionally with an Automation. The Automation runs under grants; the Skill
guides the plan. The demonstration is an episode with `reference_time` =
the Run's time.

## 113. Assistant memory

Each Assistant has observational memory (rolling summaries) and episodic
memory (index of prior Runs). Both are canonical SQLite rows in the
Assistant's home project, ingested into that project's `group_id`.
Memory is DATA (§34). Users view, correct and delete entries. Deleting an
Assistant archives canonical rows and deletes that Assistant's episodes
from the graph.

## 114. Consolidation

After a Run completes, a low-priority `GRAPH_INGEST` job writes the Run
summary, important tool results (as DATA, redacted) and any new Skill as
episodes. It never calls an external model unless the project's routing
permits and no `local_only` content is involved. Consolidation failure
leaves the Run complete; the graph catches up later.

## 115. Retention

Knowledge, memory, graph edges and artifacts are configurable.
Defaults: Knowledge indefinite, memory 365 days, artifacts 180 days, audit
indefinite. Expired memory rows are deleted canonically and their episodes
removed from Graphiti. Invalidated edges older than retention MAY be
pruned; live history needed for point-in-time audit SHOULD be kept as long
as the corresponding AuditEvents.

## 116. Search evidence

Knowledge answers show the episodes, edges and canonical sources used, with
validity windows, so a human can see "this fact was true from … to …" and
"the system learned it on …".

## 117. Rebuild

Admin → System offers "rebuild graph". It wipes the Graphiti store for a
`group_id` (or all) and re-enqueues canonical sources. Rebuild is
recoverable: SQLite is untouched. During rebuild, FTS5 serves search.

## 118. What Graphiti is not

Graphiti MUST NOT store policy, grants, credentials, effect state, or
approvals. It MUST NOT be consulted by the Dispatch Barrier. It MUST NOT
expose Cypher, a generic admin API, or raw credentials to Pi, Gondolin or
the browser. It is not a back door to Gmail or GitHub.

---

# Part XI — Models: local, hybrid, API

## 119. Tiers

```
local_small    always present: embeddings, classification, summarisation, cheap drafting
local_large    present on standard and pro profiles: agent reasoning and tool use
external       API providers, if an Owner has connected one
```

## 120. External inference is data egress

Sending a prompt to an external provider sends company data off the machine.
It is a capability, `model.infer.external`, with `leaves_company = true`.
It is evaluated per project like any capability: `off`, `ask` (approval per
Run, with grant-from-approval), or `automatic`.

## 121. Providers are Connections

External model providers are a widget kind (`model_provider`) with
Connections, health checks and epochs. Keys live in the credential store and
never enter agent context, sandboxes or browsers. Local model servers are
also Connections so routing and health are uniform.

## 122. Router rules

Per project, `model.routing`:

- `local_only`: never use `external`
- `hybrid`: prefer local; use `external` for tasks the local tier reports it cannot handle, subject to §120 and §109
- `external_preferred`: use `external` when permitted, fall back to local

Graphiti extraction and Graphiti embeddings are router calls. They MUST NOT
bypass `model.routing` or `local_only`. A `GRAPH_INGEST` job that would
need `model.infer.external` when that capability is `off` stores a raw
episode without edges instead of calling out.

## 123. Profile defaults

`lite` defaults to `hybrid` with `model.infer.external` set to `ask` because
it has no useful local agent model. `standard` and `pro` default to
`local_only`.

## 124. Weaker models raise friction, not risk

Small local models follow tool schemas less reliably and produce more
`FAILED` outcomes and more stop-and-explain. The kernel makes this safe; the
UI makes it legible (§81).

## 125. Model evidence

Each Run records which model tier and Connection served each Step, so audit
can answer "did any of this leave the machine".

## 126. Budgets

External tokens are budgeted per project and per Automation (§46). Local
inference is budgeted in minutes on `lite` only.

---

# Part XII — User interface

## 127. Surfaces

- Home: attention items, approvals, recent Runs, Assistants, budget and health tiles.
- Work: Projects, Runs, Tasks, timeline, artifacts, Inspector.
- Apps: enabled widgets with separate indicators for Connected, Available to project, Actual authority, Approval requirement, Health.
- Automate: Automations and their standing grants.
- Knowledge: browse, search, sources, Skills, graph entities and validity windows.
- Approvals: pending and past decisions.
- Admin: Overview, People, Widgets, Policies, Budgets, Audit, Backup, Updates, System.

## 128. First paint is local

Home renders from SQLite-backed summaries before any provider is contacted.
Provider refresh is asynchronous; externally sourced tiles show when they
were last refreshed. A provider outage degrades that widget's tile, not the
page.

## 129. Honest state

The UI always distinguishes proposed, running, waiting for approval,
dispatching, unknown, completed and failed. "Done" appears only with
evidence attached.

## 130. Progressive disclosure

Members see product language ("Sent", "Waiting for you", "Couldn't confirm").
Effect states, digests, policy versions and connection epochs are in the
Inspector and Admin views.

## 131. Timeline

A Run's timeline shows request → plan → approvals → execution → evidence,
with each effect's state transitions and Barrier decisions.

## 132. Mobile

Approving, denying, reading a Run and messaging an Assistant MUST work from a
phone through the web UI.

## 133. `Standard` bundle

```
Gmail       search, read automatic · draft automatic · send ask · label apply ask
GitHub      issue/pr read automatic · comment ask · pr create ask · clone automatic
Calendar    search, read automatic · create ask · update ask · respond ask · delete off
Web         named domains automatic · open web off
Models      local automatic · external ask
Knowledge   read automatic · write automatic (project) · share off · graph ingest automatic (local)
```

`Cautious` sets every external write to `off` and external models to `off`.
`Trusting` sets reversible external writes to `automatic` and leaves
irreversible ones (`mail.send`, `calendar.delete`) at `ask`.

## 134. Plain-language risk

Every capability has a one-line human description of what it can cause,
shown wherever it can be enabled or approved.

## 135. Inspector

For any Run, Task or Effect: full CONTROL and DATA, trust flags, provenance,
policy version, connection epoch, Barrier decision, evidence, and links to
AuditEvents.

## 136. Onboarding

Onboarding walks the first Owner through: set up account → choose bundle →
connect one provider (Gmail suggested) → create an Assistant → run one
read task → run one `ask` task and approve it → see the audit entry. It ends
when the Owner has seen connect → grant → read → approve → dispatch → audit
once.

---

# Part XIII — Approvals

## 137. Purpose

Approvals exist for authority transitions policy does not allow
automatically, and for creating grants. They are not a general confirmation
dialog.

## 138. Card content

An approval card shows the fields that determine what will happen: every
CONTROL value, the content-relevant DATA (body, title) or a faithful
rendering of it, the connection identity acting, the project, an expiry, a
"this sends company data outside the company" line where
`leaves_company`, and the grant-from-approval option (§42).

## 139. Digest binding

Approving binds the approval to the effect digest. If the effect changes,
the card is withdrawn and re-presented; the old approval is void.

## 140. Eligibility

Eligible approvers are Owners and project Members with an approver flag for
that project. Eligibility is evaluated at decision time. Auditors cannot
approve. A revoked or suspended principal cannot approve queued effects.

## 141. Absence

Members can mark themselves absent with a date range. Routing skips absent
approvers. If no eligible approver exists, the effect stays
`WAITING_APPROVAL` with a visible "no one can approve this" state; it is
never bypassed.

## 142. Expiry

Approvals expire (default 24 hours). Expired approvals return the effect to
`WAITING_APPROVAL` with a note.

## 143. Batch review

Multiple pending effects from one Run MAY be shown together, but each is
approved individually and bound to its own digest.

## 144. Audit

Every approval, denial, expiry and grant-from-approval is an AuditEvent
correlated to the effect.

---

# Part XIV — People and roles

## 145. Roles

```
Owner     organisation   governance: policy, widgets, connections, people, budgets, backup, updates
Member    organisation   use Assistants and granted capabilities; own USER_OAUTH connections;
                         may hold approver flag per project
Auditor   organisation   read-only audit, policy and effect visibility; cannot approve or connect
```

Auditor and Owner are mutually exclusive. There is always at least one Owner.
The last Owner cannot be revoked, suspended or demoted. Manager and Admin
roles are deferred (Part XXII).

## 146. Schema

```
principals(id, organisation_id, kind, email, display_name, status,
           auth_subject, auth_epoch, created_at, created_by, revoked_at)

role_bindings(id, principal_id, role, granted_by, granted_at, expires_at,
              UNIQUE(principal_id, role))

project_memberships(project_id, principal_id, approver, added_by, added_at,
                    PRIMARY KEY(project_id, principal_id))
```

A trigger or transactional check enforces the last-Owner invariant in the
database, not only in application code.

## 147. Auth epochs

Revoking a user, resetting their authentication or a sensitive security
change increments `auth_epoch`. Sessions, in-flight Runs and effects carrying
an older epoch fail at the Barrier and at the API. Revocation takes effect
on the next request.

## 148. Bootstrap

Create organisation → first `HUMAN` principal → Owner binding → default
project with membership → recovery key generated and shown once → commit
atomically. No vendor password or default account remains.

## 149. Invitations

Owners invite by email. An invitation creates a pending principal; it becomes
active on first login. Invitations expire.

## 150. Departure

Revoking a person disables their `USER_OAUTH` connections, removes their
memberships, voids their pending approvals, and marks any shared connection
they owned as needing reassignment (§161).

## 151. Break-glass

For total Owner authentication loss. Requires host access (physical console
or already-authorised SSH) and the recovery key shown at bootstrap or
rotated since. `agent-os reset-owner` restores or replaces Owner
authentication, rotates the recovery key, writes an AuditEvent and
authorises nothing else. There is no vendor-side path.

## 152. Local administration

Host administration (updates, disk, network) is organisation-controlled host
access. It is separate from product roles and cannot approve effects or read
the credential store without the recovery key.

## 153. Client distrust

The browser client never decides authority or roles. All checks are server
side.

## 154. Sessions

Sessions are bound to principal and auth epoch, expire, and can be revoked
individually from People.

---

# Part XV — Widgets and connections

## 155. Widget contents

A widget pack contains: an immutable version tied to the appliance release;
capability descriptors (§38); one adapter implementing narrow methods per
capability; connection kinds; a UI card; a health check with no side
effects; plain-language risk text; resource requirements.

## 156. In-repo, versioned with the appliance

V1 widgets live in the appliance repository and ship with the appliance
release. There is no runtime installation of widgets by anyone, and no
independent widget packaging (deferred, Part XXII).

## 157. Enablement grants nothing

Enabling a widget for the organisation exposes its capabilities to project
policy tables as `off`. Enabling it for a project makes its connections
selectable there. Neither creates authority.

## 158. Connections grant nothing

```
connections(id, widget, kind, subject_identity, owner_principal_id,
            status, epoch, health, created_at, revoked_at)
connection_projects(connection_id, project_id, exposed_by, exposed_at)
```

`status ∈ { DRAFT, CONNECTED, DISABLED, ORPHANED, REVOKED }`. A `CONNECTED`
connection is reach, not permission.

## 159. Connection protocol

Connect → `DRAFT` → provider OAuth or app install → verify identity server
side → store credential in the credential store → `CONNECTED` → health
loop. Tokens never leave the credential store except as placeholders (§87)
or inside adapter calls in the Control Plane.

## 160. Who may connect

Members connect only their own `USER_OAUTH` identity. Shared accounts,
GitHub App installations and model provider keys require an Owner.

## 161. Orphaning

A shared connection whose owning Owner is revoked becomes `ORPHANED`. It
cannot dispatch until another Owner takes ownership. Home shows orphaned
connections as attention items.

## 162. Epochs

Reauthorisation, scope change, or credential rotation increments the
connection epoch. Effects prepared under an older epoch are blocked at the
Barrier and must be re-prepared.

## 163. Adapter contract

Adapters expose one method per capability with typed CONTROL and DATA
inputs, return structured evidence, map provider errors to stable internal
classes (`AUTH`, `RATE_LIMIT`, `NOT_FOUND`, `CONFLICT`, `TRANSIENT`,
`UNKNOWN_OUTCOME`), and never retry irreversible calls (§55). No adapter
exposes a generic "request" method to agents.

## 164. Provider ceiling

Provider scope may reduce what a capability can do. It never increases
authority. A broad OAuth scope changes nothing in policy.

---

# Part XVI — V1 packs

## 165. Catalog

```
gmail            mail.*
google_calendar  calendar.*
github           repo.*
web_research     web.*
model_provider   model.*
```

Slack, Notion, CRM and Microsoft integrations are not in V1.

## 166. Gmail

Connections: `USER_OAUTH`, `SHARED_ACCOUNT` (Owner only).
Capabilities:

```
mail.search        READ
mail.read          READ
mail.draft         EXTERNAL_REVERSIBLE   IDEMPOTENT (by draft key)
mail.send          EXTERNAL_IRREVERSIBLE UNSAFE_TO_REPEAT  leaves_company
mail.label.read    READ
mail.label.apply   EXTERNAL_REVERSIBLE   IDEMPOTENT
```

Sender, recipients (to/cc/bcc), attachment identities and thread target are
CONTROL. Subject and body are DATA but content-relevant for the digest.
`mail.send` is `off` in every bundle except by explicit Owner change, and
its approval binds sender, recipients, subject, body, attachments, thread
target and draft version. A draft approval never authorises a send.
Reconciliation of an `UNKNOWN` send searches the Sent folder by an
idempotency header this system adds to every outgoing message. No browser
scraping.

## 167. GitHub

Connection: GitHub App installation (Owner). A PAT is break-glass fallback
only and expires.
Capabilities:

```
repo.issue.read          READ
repo.issue.comment       EXTERNAL_REVERSIBLE   RECONCILIABLE
repo.pr.read             READ
repo.pr.create           EXTERNAL_REVERSIBLE   RECONCILIABLE (by head branch)
repo.pr.request_review   EXTERNAL_REVERSIBLE   IDEMPOTENT
repo.webhook.ingest      inbound event
repo.git.clone           READ (into sandbox, placeholder token)
```

Repository, installation, base branch and head branch are CONTROL; issue
and PR text are DATA. Merging to the default branch is not a V1 capability.
Webhook payloads remain untrusted text after signature verification and are
deduplicated by delivery ID.

## 168. Google Calendar

Capabilities:

```
calendar.search    READ
calendar.read      READ
calendar.create    EXTERNAL_REVERSIBLE   RECONCILIABLE (by client key)   leaves_company if attendees external
calendar.update    EXTERNAL_REVERSIBLE   RECONCILIABLE (by ETag)
calendar.delete    EXTERNAL_IRREVERSIBLE UNSAFE_TO_REPEAT
calendar.respond   EXTERNAL_REVERSIBLE   IDEMPOTENT
```

Calendar, attendee identities, event ID and time are CONTROL; title and
description are DATA. Updates bind the provider ETag; a mismatch fails
rather than overwrites. Compensation for a system-created event deletes only
that event; `calendar.delete` on arbitrary events is `off` by default.

## 169. Web Research

Capabilities: `web.page.fetch`, `web.page.extract`, `web.search`,
`web.recipe.run`, all `READ`. Rules in Part IX apply. Extracted content and
summaries are untrusted with retained provenance.

---

# Part XVII — Audit, credentials, secrets

## 170. AuditEvent

Append-only rows for: policy changes, grants, role and membership changes,
connection lifecycle, approvals and denials, Barrier decisions and dispatch
outcomes, reconciliation results, Knowledge sharing, break-glass, backups,
updates. Each carries actor principal, Run/Task/Effect correlation where
applicable, before/after for configuration changes, and a timestamp.

## 171. Immutability

Ordinary users and agents cannot mutate history. Owners cannot delete audit
rows; retention is by policy and is itself audited.

## 172. Sensitive logging

Secrets, message bodies beyond what the digest requires, and unnecessary
personal data are excluded from audit payloads. Evidence is stored in the
artifact store and referenced.

## 173. Credential store

One encrypted store on the appliance, readable only by the Control Plane
process, keyed by a key derived at boot from local material plus the
organisation recovery material for backup encryption. Agents, sandboxes and
browsers see logical connection references and placeholders only.

## 174. Rotation and revocation

Credentials support replacement and revocation. Both increment the
connection epoch (§162). Revocation blocks stale dispatch on the next Barrier
evaluation.

## 175. Redaction

Credentials are redacted from logs, artifacts, timeline entries and error
messages by pattern and by known-value matching.

## 176. Minimum scope

Provider scopes requested are the minimum for the enabled capabilities.
Enabling a new capability that needs a wider scope triggers reauthorisation
and a new connection epoch.

## 177. Host separation

Worker processes run as a separate OS user from the Control Plane with no
read access to the credential store or the authority database.

## 178. Admin Overview

Admin Overview shows operational health, pending governance issues (orphaned
connections, expired grants, failed backups, `UNKNOWN` effects awaiting a
human), and recent high-impact audit events.

---

# Part XVIII — Backup, release, updates

## 179. Backup contents

The SQLite database, the Graphiti/FalkorDB Lite graph file, configuration,
Knowledge canonical sources, artifacts, and the encrypted credential blob
with its recovery metadata. Backups are encrypted with organisation recovery
material. The graph file is included so restore is fast; if it is missing or
corrupt, restore still succeeds and Admin offers rebuild (§117).

## 180. Backup targets

Local disk, an attached drive, or an organisation-controlled object store.
The vendor never receives backups.

## 181. Restore

Restore preserves logical IDs so audit and effect correlation remain valid.
Effects in `DISPATCHING` become `UNKNOWN` (§58). Connections are restored as
`CONNECTED` only if their credentials decrypt and a health probe succeeds;
otherwise `DISABLED` pending reauthorisation. If the graph file is absent or
fails to open, canonical data is still live and a rebuild is queued.

## 182. Test restore

Admin → Backup has a "test restore" action that restores the latest backup
into a scratch database and reports integrity. A backup strategy without a
passed test restore is shown as incomplete.

## 183. Retention

Backup retention is configurable; default keeps daily for 14 days, weekly
for 8 weeks.

## 184. Appliance image and channels

The appliance ships as a signed image. Organisations choose a channel
(`stable`, `early`). The Control Plane verifies signatures before staging.

## 185. Staged updates and rollback

Updates are downloaded, verified and staged; activation is an Owner action
or a scheduled window. Rollback to the previous release is supported where
migrations permit. Migrations are explicit and versioned; a high-risk
migration takes a pre-migration backup automatically.

## 186. Capabilities in updates

New capabilities arrive as `off` in every project (§40). Critical security
updates raise a Home attention item for Owners.

---

# Part XIX — Deployment profiles

## 187. Profiles are configuration

A profile is a small file:

```
memory_reserve_mb
limits: { MODEL, BROWSER, SANDBOX, EMBEDDING, GRAPH_INGEST }
sandbox_memory_mb
graph_backend: falkordb_lite | falkordb
tiers: { local_small: <model>, local_large: <model | none> }
routing_default: local_only | hybrid | external_preferred
```

The logical architecture and the safety tests are identical across
profiles.

## 188. `lite`

Raspberry Pi 5 class, 8–16 GB, no accelerator.
SANDBOX 1 · BROWSER 1 · EMBEDDING 1 · GRAPH_INGEST 1 · local_large none ·
local_small a small CPU embedding/classification model. Graph backend:
FalkorDB Lite. Routing default `hybrid` with `model.infer.external` at
`ask`. Graph ingest on `lite` often stores raw episodes until a capable
model is allowed; FTS5 still works. Suitable as a full appliance for
API/hybrid use, or later as a Control Plane node with remote workers.

## 189. `standard`

Mac mini M4 / M4 Pro class, 24–64 GB unified memory.
SANDBOX 2 · BROWSER 1 · GRAPH_INGEST 1 · local_large a ~30B-class quantised
model. Graph backend: FalkorDB Lite. Routing default `local_only`. This is
the reference solo appliance.

## 190. `pro`

DGX Spark class, 128 GB unified memory, ~273 GB/s.
SANDBOX 4 · BROWSER 2 · GRAPH_INGEST 2 · local_large up to ~200B-parameter
NVFP4 MoE models. Graph backend: FalkorDB Lite default; FalkorDB server
optional. Routing default `local_only`. OS, page cache, weights, KV cache
and the graph file share one pool: the memory reserve is the primary
admission rule, and inference memory utilisation is capped well below the
pool size to avoid host instability.

## 191. Gondolin on every profile

Because Gondolin provides the same micro-VM isolation on all three profiles,
the sandbox threat model is identical across hardware and no profile
downgrades isolation.

## 192. Worker machines later

Adding a worker machine binds `Worker.run` (§63) to a remote node. The
Control Plane, SQLite, Graphiti store, credential store and audit stay on
one machine. Cluster concerns (leases, node identity, placement) are
deferred (Part XXII).

---

# Part XX — Safety properties (V1)

All MUST pass before first release.

1. last Owner cannot be revoked, suspended or demoted
2. Auditor cannot approve any effect or create a connection
3. enabling Gmail does not permit send
4. connecting Gmail does not permit send
5. OAuth scope breadth does not create mail authority
6. mail draft approval cannot authorise send
7. changed approved recipient invalidates approval
8. changed approved body invalidates approval
9. web-derived recipient does not become trusted CONTROL
10. ambiguous Gmail send becomes UNKNOWN and reconciles; it is never retried
11. two effects on one thread cannot be in flight together
12. research browser cannot read any widget credential
13. Gondolin Playwright cannot access browserd profiles
14. sandbox guest never observes secret bytes; placeholders substitute only on allowed hosts
15. sandbox cannot reach hosts outside its Task allowlist
16. open web browsing blocks loopback, RFC1918 and link-local
17. redirects are revalidated; DNS rebinding is blocked
18. Home renders with all providers offline
19. project A authority, Knowledge and memory cannot leak to project B
20. revoked user loses authority on next request; stale sessions fail after epoch change
21. policy narrowing blocks a stale effect; widening does not retroactively authorise
22. connection revoke, epoch bump or ORPHANED state blocks dispatch
23. duplicate webhook deliveries do not duplicate Runs
24. signed webhook payload instructions are not trusted
25. untrusted issue text cannot change target repository or branch
26. calendar attendee cannot be injected from description text
27. stale calendar update (ETag mismatch) does not overwrite
28. compensation cannot delete a pre-existing event
29. a Skill cannot widen authority
30. Assistant memory content cannot become trusted CONTROL
31. `local_only` Knowledge is never included in an external model prompt or embedding request
32. external model provider key never appears in agent context, sandbox or browser
33. health probes produce no external side effects
34. Owner UI actions still cross the Dispatch Barrier
35. new capabilities in an update arrive as `off`
36. runtime widget installation is impossible
37. disabling a widget blocks new dispatch and does not redispatch UNKNOWN effects
38. restored DISPATCHING effects become UNKNOWN and are not redispatched
39. budgets block at the Barrier and cannot widen authority
40. external content never becomes CONTROL without an explicit trust transition
41. a Graphiti-extracted email, name or URL cannot become trusted CONTROL
42. Graphiti search from project A cannot return project B nodes
43. Graphiti construction never uses OpenAI unless a model_provider Connection and policy allow external inference
44. `local_only` sources are never sent to Graphiti extraction or embedding that would leave the machine
45. wiping or losing the graph file does not lose canonical Knowledge; rebuild restores the graph
46. Dispatch Barrier does not read Graphiti
47. Pi cannot call Cypher or a Graphiti admin client
48. Knowledge search still returns FTS5 hits when Graphiti is unhealthy
49. human graph correction invalidates the old edge rather than deleting history
50. Graphiti health probes do not call an LLM

Deferred with their features: widget package digest verification, worker
lease and epoch behaviour, Member access to shared mailboxes, Admin and
Manager role limits, form submission and upload controls, Neo4j as an
optional graph backend.

---

# Part XXI — Build order

```
Phase 1  Kernel
         SQLite schema, principals, Owner/Member/Auditor, auth epochs,
         default project, AuditEvent, credential store, bootstrap,
         agent-os reset-owner, sessions

Phase 2  Effect law
         capability registry, policy table and bundles, grants,
         grant-from-approval, Effect Ledger, digest approvals,
         Dispatch Barrier, in-flight conflict index, reconciliation
         scheduler, budgets, approval routing and absence

Phase 3  Runtime
         agent-osd modules, Worker interface, resource semaphores and
         profiles, Pi with generated tools, Gondolin integration with
         placeholder secrets and per-Task network policy, model router
         with local_small and one external model_provider connection

Phase 4  Product
         dashboard (Home, Work, Approvals, Apps, Admin), mobile web,
         Assistants, Knowledge canonical store + FTS5, Graphiti with
         FalkorDB Lite and router-bound extraction, Skills, Assistant
         memory, Inspector, onboarding, graph rebuild

Phase 5  Packs, in this order
         Gmail read/search → Gmail draft → Gmail send (reference
         irreversible effect) → Calendar → GitHub (App install, clone,
         PR create) → Web Research (named domains) → local_large tier
         and local_only routing

Phase 6  Hardening
         all Part XX tests green; backup, test restore; signed image,
         channels, staged update and rollback; host separation of worker
         user; profile tuning on lite, standard, pro hardware

Phase 7  Second wave
         items from Part XXII, prioritised by customer evidence
```

---

# Part XXII — Deferred (roadmap, not V1)

- Manager and Admin roles; per-project role matrix; `SERVICE` principals
- Four-level autonomy (L0–L3); V1 is `off | ask | automatic` plus grants
- Policy engine with draft, validate, semantic diff, publish and snapshots
- Independently versioned, signed widget packages with per-widget rollback
- Third-party adapters and MCP as an adapter transport (still behind the Barrier)
- Cluster deployment: worker leases, node identity, placement, PostgreSQL
- Chat channels (Slack, Telegram, WhatsApp) as inbound events and approval surfaces
- Shared mailboxes accessible to Members; richer GitHub installation management
- Open-web form submission, logins and uploads under separate capabilities
- A tighten-only risk-review model that can escalate to `ask` but never loosen policy
- Skill lifecycle beyond `UNREVIEWED` / `REVIEWED`
- Full trust-class lattice (`TRUSTED_CONTROL`, `TRUSTED_DATA`, `UNTRUSTED_TEXT`, `UNVERIFIED_EXTERNAL`, `DERIVED_FROM_UNTRUSTED`); V1 uses `trusted` flag plus provenance
- Browser recipe learning beyond §112
- Notification channels beyond dashboard and mobile web
- Timed break-glass ceremony; V1 is `reset-owner` with the recovery key
- Slack, Notion, CRM and Microsoft packs
- Neo4j or FalkorDB server as a non-default graph backend
- Zep Cloud (forbidden, not deferred)
- Community/Saga-heavy ontology customisation beyond Graphiti defaults

---

# Part XXIII — Implementer checklist

Before shipping a feature, answer:

1. Is this a surface, an authority, or a provider ceiling?
2. Did enabling or connecting anything accidentally create authority?
3. Which fields are CONTROL, and can untrusted DATA alter them?
4. Which policy row, grant and connection epoch are checked at dispatch?
5. What happens after policy narrowing, connection revocation or auth epoch bump?
6. What happens if the provider response is lost? Is retry actually safe? How is UNKNOWN reconciled?
7. What conflict key protects the external resource?
8. Which runtime executes this (Control Plane, Pi, Gondolin, browserd, Graphiti ingest), and what can it see?
9. Does any company data leave the machine, including inside a model prompt, Graphiti extraction, or embedding request?
10. Can a Skill, memory entry, Graphiti edge, webpage or webhook make this happen without a human trust transition?
11. Does the SQLite schema enforce the invariant, or only the code? Would losing the graph file lose it?
12. Which Part XX test covers it?

If any answer is unclear, the feature is not ready.

---

# Part XXIV — Closing

Agentic OS Edge is a governed execution system, not an autonomous root
agent. Humans govern. Policy defines authority. Assistants propose.
Approvals bind exceptional authority. The Dispatch Barrier decides whether
an effect may leave. Adapters talk to providers. The Effect Ledger records
what was attempted. Reconciliation determines what happened. Artifacts and
Audit keep the evidence. Graphiti remembers how facts changed without ever
becoming authority. Skills and memory make the system better at proposing
without ever making it more authorised. Gondolin and browserd keep untrusted
execution away from everything that matters, on every machine the product
runs on.

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
graph fact ≠ CONTROL
learned skill ≠ granted authority
external inference ≠ local
graphiti ≠ kernel
owner ≠ root
browser ≠ universal adapter
widget ≠ kernel
```

Everything may propose. Only explicit authority may decide. Only the
Dispatch Barrier may let an external effect leave. After it leaves,
evidence, not optimism, determines what happened.
