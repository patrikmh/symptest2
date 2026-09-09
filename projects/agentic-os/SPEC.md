# Agentic OS Edge — Canonical Architecture Specification v7.1

Status: production architecture baseline (supersedes v7.0, v6.2, v6.1, v6.0, v5.6)
Target: private, self-hosted agentic operating system for small and mid-sized organisations
Product shape: a roster of named Assistants (Grok Bot ease), that learn in the open (Hermes), behind a kernel neither of them has
Deployment: one appliance the company already owns — Raspberry Pi 5, Mac mini M4 / M4 Pro, NVIDIA DGX Spark
Core loop: Propose → Decide → Do → Prove
Knowledge: SQLite canonical + FTS5, with Graphiti (self-hosted, FalkorDB Lite) as the derived temporal graph

Normative words: MUST, MUST NOT, SHOULD, MAY have their usual meaning.
"V1" means the first release. Anything in Part XXII is roadmap and MUST NOT be built before Part XXI Phase 5.

Sections are numbered 1–182 with no gaps.

## Revision note

v7.0 is the full specification rewritten for one question: what does a
20-person company need on day one, and what law must already be true so
that day 200 does not require a redesign.

The kernel is unchanged from v5.6 through v6.2: Propose → Decide → Do →
Prove; CONTROL vs DATA; Effect Ledger with first-class UNKNOWN; Dispatch
Barrier as the only external-write choke point; digest-bound approvals;
credential isolation; no vendor root; evidence over claims; `mail.send` as
the reference irreversible effect; enabled ≠ connected ≠ authorized.

Kept from v6.x: Owner / Member / Auditor; `off | ask | automatic` plus
grants; policy as an audited table; SQLite as the only authority store;
one `Worker.run` interface; Assistants; Skills and memory as DATA; model
router with external inference as egress; Graphiti as a derived,
rebuildable, router-bound temporal graph.

Changed in v7.0:

- **V1 packs are Gmail, Google Calendar, Web Research and model
  providers.** GitHub, and with it Gondolin coding sandboxes, move to
  Phase 5. Gondolin's architecture is fixed now (Part VIII) so V1 cannot
  preclude it, but V1 ships no sandbox.
- **Graphiti stays V1** because temporal facts ("the vendor was X until
  March") are the learning story, and bolting bi-temporal edges onto SQLite
  by hand is how Graphiti gets reinvented badly. Its cost is bounded by three
  rules: derived never authority; behind `knowledge.search`; degrades to
  raw episodes.
- **One bundle.** `Standard` ships. "Allow cloud models?" is one onboarding
  toggle. Cautious and Trusting are deferred.
- **Hardware is detected, not picked.** The profile is derived from the
  machine; an Owner may override in Admin → System.
- **The UI shows five objects.** Assistants, chats, Skills, tools,
  artifacts. Project, Task, Step, Effect, epoch, budget, profile and graph
  are hidden until a person has a reason to open the Inspector.
- **Group threads deferred.** V1 is one human, one Assistant, one Run.
- **Ease is measured.** Ten minutes from install to a governed send.
  Approval fatigue has a default remedy. Notifications exist. Teach-once
  has a designed screen.
- **The V1 test gate is 30 tests.** Graphiti tests gate Graphiti; sandbox
  tests gate Phase 5.

v7.1 records the first interview decision: humans reach the appliance
over a Tailscale tailnet when they are away, and over loopback when they
are at the machine. Tailscale is a path, not a principal. Funnel and
public ingress are forbidden. Part XX.A (§176–§182) is normative.

---

# Part I — Law

## 1. Purpose

Agentic OS Edge turns a company-owned machine into a governed agentic
environment. It gives a small company named AI teammates that read,
research, draft, schedule and, with permission, send — while company data
stays on company hardware and the model is never a trusted authority.

## 2. Promise

A person states a goal in ordinary language. The system plans, retrieves
evidence, asks for approval when policy requires it, executes, verifies and
keeps the evidence.

Measured promise: a company with no IT department MUST be able to go from
first boot to a governed, audited `mail.send` in under ten minutes, with
one connected Gmail account and one Assistant.

The product is a dashboard of teammates, work that needs a human, and
evidence of what left the machine. It is not a chat window with plugins.

## 3. Logical architecture

```
Humans
  ↓  loopback (desk) or Tailscale tailnet (away)   — not the public internet
Presentation      dashboard, mobile web, one notification channel
  ↓
Control Plane     authority, Effect Ledger, audit, canonical Knowledge, Graphiti ingest queue, scheduling, approvals
  ↓
Worker Plane      model inference (incl. Graphiti extraction), browserd, embeddings   [Phase 5: Gondolin]
  ↓
Stores            SQLite (authority) · Graphiti / FalkorDB Lite (derived graph) · artifact files
  ↓
Adapters          one per widget
  ↓
External systems  Gmail, Google Calendar, the web, model providers
```

Every external effect crosses the Control Plane. Nothing in the Worker
Plane or Presentation layer reaches an external system directly. Graphiti
never calls a provider, never writes authority tables, never talks to Zep
Cloud.

## 4. Primary invariant

Assistants may propose. Assistants possess no inherent authority.
Authority comes only from published policy, grants and approvals.

## 5. Propose → Decide → Do → Prove

Every meaningful external effect passes four stages in order. Planning and
model output belong to PROPOSE. Policy and approval belong to DECIDE.
Provider interaction belongs to DO. Evidence belongs to PROVE. An
Assistant saying "sent" is never evidence.

## 6. The model is an untrusted I/O device

Models MAY interpret, reason, transform, draft and suggest tool calls.
Models MUST NOT decide whether a capability is authorised, and model
output MUST NOT raise the trust level of any value. A second model
reviewing the first is still a model (§76).

## 7. Modular monolith

The Control Plane is one process (`agent-osd`) with internal modules.
Modules MUST NOT become network services for symmetry. Network boundaries
exist only where the other side is unreliable or untrusted: providers, the
browser, external model APIs, webhook senders, and later sandboxes and
worker machines.

## 8. Private by default

The appliance MUST be fully functional with no vendor cloud reachable.
Company data leaves the machine only through a configured provider and a
governed effect. Sending a prompt to an external model is such an effect
(Part XI). Opening Home from another building uses the organisation's
Tailscale tailnet (Part XX.A), not a public URL. The overlay is a path.
It is not a vendor root and not an Edge principal.

## 9. Least authority

Each action receives only the authority it needs. There is no ambient
credential, no globally reusable tool handle and no generic provider
client within an Assistant's reach.

## 10. No hidden root

Administration is explicit and performed by identified humans. There is no
vendor principal, standing vendor SSH key or vendor impersonation path.

## 11. Evidence over claims

A task is complete when the system holds evidence: a provider object ID,
an API response, a file artifact, a screenshot, database state.

## 12. Safe failure and recoverability

When authority or effect state is ambiguous the system stops and explains
rather than guesses and mutates. Rare failures need not be impossible if
they are detected, contained, explained and recoverable.

## 13. Irreversible effects last

Within a workflow that mixes reversible and irreversible steps,
irreversible external effects SHOULD occur as late as possible.

## 14. Ease is a law

The kernel MUST stay strict. The interface MUST stay simple. If an Owner
must understand CONTROL vs DATA to send a weekly update, the product has
failed. If an Assistant can send because it is "connected", the kernel has
failed. Both are release blockers.

---

# Part II — Domain model

## 15. Organisation

The top-level governance boundary. One per appliance in V1.

## 16. Project

A collaboration and authority boundary inside the organisation: members,
Assistants, Runs, Knowledge, Automations, grants, policy rows, artifacts.
V1 creates one default project every member belongs to. The word
"Project" does not appear in the Member UI until an Owner creates a second
one.

## 17. Principal

An identity that participates in policy evaluation. V1 kinds: `HUMAN`,
`AUTOMATION`. Every Run has exactly one initiating principal.

## 18. Assistant

A named, persistent teammate. An Assistant is:

- a persona (name, avatar, title, instructions)
- a memory scope a human can open, correct and delete (Part X)
- a home project
- zero or more standing grants shown on its card
- a presence: idle, thinking, working, waiting, blocked, done

An Assistant never runs as a daemon. Every action is a Run. Its authority
in a Run is exactly project policy ∩ (initiating human's membership ∪ the
Assistant's grants) ∩ connection exposure ∩ budgets, evaluated at dispatch.

The sidebar is a roster of Assistants, not a chat history. Coming back
tomorrow means coming back to the same teammate.

## 19. Run

One execution of a goal, an Automation firing or an inbound event. The
anchor for chat transcript, timeline, artifacts, effects and audit
correlation. A chat is the conversational face of a Run.

## 20. Task and Step

A Run MAY contain Tasks (bounded units for an agent or deterministic
worker); a Task MAY contain Steps (checkpoints). Browser sessions and
worker jobs attach to a Task. Tasks and Steps are Inspector concepts, not
Member UI.

## 21. Effect

A proposed or attempted state change outside pure reasoning:
`mail.send`, `calendar.create`, `model.infer.external`, `knowledge.write`.
Effects live in the Effect Ledger (Part V).

## 22. Artifact

Durable output or evidence with provenance: file, report, screenshot,
extracted page, provider response. Artifacts survive session destruction.

## 23. Approval

A human decision bound to the digest of one exact proposed effect, or to
one bounded grant request. Single-use, expiring.

## 24. Capability

A typed operation policy can evaluate, namespaced: `mail.*`, `calendar.*`,
`web.*`, `knowledge.*`, `model.*`. Knowledge capabilities are kernel
capabilities, not a widget.

## 25. Grant

Authorisation of a capability under constraints: project, connection,
resource, subject (human, Automation or Assistant), CONTROL value
constraints, expiry.

## 26. Connection

Technical provider access: an OAuth identity, an API key, a local model
endpoint. Reach, not permission.

## 27. Skill

A project-scoped, versioned procedure a human can open and edit. DATA;
never authority. Canonical in SQLite; also a Graphiti episode.

## 28. Graphiti

The temporal knowledge graph engine: episodes, entities, bi-temporal facts
derived from canonical sources. Not an authority store, not a policy store,
not a ledger (Part X).

## 29. Widget

A pack that brings a provider into the system: capability descriptors, one
adapter, connection kinds, a card, a health check, risk text (Part XV).

---

# Part III — Trust

## 30. CONTROL vs DATA

CONTROL determines what an action targets: recipient, sender, calendar,
attendee, event ID, thread, URL, destination domain, model provider. DATA is
the content the action carries: body, subject, title, description, summary.

## 31. Trusted CONTROL

Every CONTROL field carries `trusted: boolean` and a provenance reference.
A CONTROL value becomes trusted only through an explicit transition:

- a human typed or selected it in the UI
- it matches a policy allowlist or a grant constraint
- a human approved it on a card that displayed it

The Dispatch Barrier MUST reject any effect with an untrusted CONTROL value.

## 32. External content is adversarial

Email, webpages, documents, calendar descriptions, webhook bodies and
anything derived from them are untrusted. Prompt injection is an expected
property of such content. An instruction inside it grants nothing and
targets nothing.

## 33. No trust upgrade by transformation

Parsing, extraction, summarisation, translation and signature verification
do not make content trusted. Tool schemas constrain syntax, not authority.

## 34. Memory, Skills and graph facts are DATA

Remembered facts, Skills, Graphiti entities and edges are untrusted for
CONTROL. "Last time we sent this to alice@…" does not make that address a
trusted recipient. Graphiti extraction is model output (§6, §33).

## 35. Provenance

Artifacts and Knowledge chunks retain source identity and location,
retrieval time, producing Run, producing model or tool, transformation
chain. Derived content inherits the lowest trust of its inputs.

## 36. Webhooks

Signature proves the sender, not the payload. Payloads are normalised,
deduplicated by provider event ID, and treated as untrusted text.

## 37. Downloads

Files fetched by the browser are quarantined artifacts, never executed on
the host, opened only inside a sandbox once Phase 5 exists.

---

# Part IV — Capabilities and policy

## 38. Capability descriptor

```
name                  mail.send
widget                gmail
risk_class            READ | LOCAL_WRITE | EXTERNAL_REVERSIBLE | EXTERNAL_IRREVERSIBLE
idempotency           PURE | IDEMPOTENT | RECONCILIABLE | UNSAFE_TO_REPEAT
control_schema        fields that are CONTROL
data_schema           fields that are DATA
resource_selector     how the external resource key is derived
reconcile(effect)     determines outcome from provider state
on_unknown            RECONCILE | FAIL | HOLD
compensation          optional; narrower than general delete
leaves_company        boolean, for disclosure
risk_text             one plain sentence shown wherever it can be enabled or approved
```

`EXTERNAL_IRREVERSIBLE` MUST be `RECONCILIABLE` or `UNSAFE_TO_REPEAT` and
MUST define `reconcile`.

## 39. Policy is a table

```
policy_rules(project_id, capability, mode, updated_by, updated_at)
  mode ∈ { off, ask, automatic }

grants(id, capability, project_id, connection_id,
       subject_kind, subject_id,            -- HUMAN | AUTOMATION | ASSISTANT
       control_constraints_json, granted_by, granted_at,
       expires_at, revoked_at)
```

`off`: not offered. `ask`: every effect needs an approval. `automatic`:
policy suffices; CONTROL must still be trusted. A grant narrows `ask` to
`automatic` for effects whose CONTROL satisfies its constraints. Every
change is an AuditEvent. There is no draft/publish engine.

## 40. Defaults on enablement and update

A newly enabled widget or newly released capability appears in every
project as `off`. Nothing gains authority by appearing.

## 41. One bundle

Onboarding fills the default project with `Standard` (§118) and asks one
question: "Allow cloud models? No / Ask me each time / Yes." Owners edit
rows afterwards, one at a time, with a plain sentence describing the
change. Cautious and Trusting bundles are deferred.

## 42. Grant-from-approval

When a human approves an `ask` effect, the card offers "Allow this
automatically for [narrowed CONTROL] for [7 / 30 / 90 days]". The
narrowing is derived from the effect: recipients within a domain, this
calendar, this site. Accepting creates a grant with an AuditEvent.

## 43. In-company default

To prevent approval fatigue, the `Standard` bundle includes one prepared
grant offer: after the first approved `mail.send` whose recipients are all
inside the organisation's own domains, the card's default suggestion is
"Allow sends to @ourdomain automatically for 30 days". External recipients
are never included in that suggestion.

## 44. Current policy wins

Authority is evaluated at dispatch, not at proposal. Narrowing blocks
stale effects. Widening never retroactively authorises.

## 45. Roles are not agent capabilities

A human role governs what the human sees and administers. It grants
nothing to an Assistant.

## 46. Project isolation and budgets

Policy rows, grants, connection exposure, Knowledge and Assistant memory
are project-scoped. Budgets per project and per Automation cover external
model tokens, external API calls and browser minutes; checked at admission
and at the Barrier; visible on Home only when 80% consumed. Budgets never
widen authority.

## 47. Capability registry

Tools handed to Pi in a Run are derived from: enabled widgets → policy
rows not `off` → connections exposed to the project → budgets. Nothing
else.

---

# Part V — Effect lifecycle

## 48. Effect Ledger

```
effects(id, run_id, task_id, capability, project_id, principal_id,
        connection_id, connection_epoch, control_json, data_ref,
        digest, state, approval_id, external_resource_key,
        provider_object_id, evidence_ref, policy_version,
        created_at, updated_at, attempt_count, last_error_class)
```

## 49. States

```
PROPOSED · PREPARED · WAITING_APPROVAL · BLOCKED
DISPATCHING · SUCCEEDED · FAILED · UNKNOWN
```

## 50. UNKNOWN is first class

A timeout, lost response or crash during `DISPATCHING` produces `UNKNOWN`.
For `UNSAFE_TO_REPEAT` capabilities `UNKNOWN` MUST NOT lead to a retry.
Reconciliation calls `reconcile`, which queries provider state and moves
the row to `SUCCEEDED` or `FAILED` with evidence. Undecidable rows stay
`UNKNOWN`, appear on Home as attention items, and hold their conflict key.

## 51. Effect digest

A normalised digest over all CONTROL fields and content-relevant DATA
fields. Recomputed at the Barrier; mismatch with the approval is a block.

## 52. Approval binding

One approval references one effect ID and one digest. Single-use, expires
(default 24 h). Changing a bound field invalidates it and returns the
effect to `WAITING_APPROVAL`.

## 53. Dispatch Barrier

One function every external write passes immediately before the provider
call. In order, blocking on first failure:

1. state is `PREPARED`, or `WAITING_APPROVAL` with a valid approval
2. capability exists and is not `off`
3. every CONTROL field is trusted
4. initiating principal active; auth epoch current
5. connection `CONNECTED`, exposed to the project, epoch matches
6. mode `automatic`, or a grant matches CONTROL, or a matching approval exists
7. digest matches approval (if any)
8. budgets permit
9. no conflicting row holds the external resource key
10. idempotency constraint allows this attempt

The Barrier records policy version and connection epoch on the effect.
There is no bypass, including for Owners in the UI, and including a
reviewer model.

## 54. In-flight conflict

A unique index on `(connection_id, external_resource_key)` over
`DISPATCHING` and `UNKNOWN` rows. The key is as narrow as correctness
allows: a thread, an event — never a mailbox.

## 55. Single retry owner

The ledger owns retry. `PURE` and `IDEMPOTENT` retry with backoff.
`RECONCILIABLE` reconciles first. `UNSAFE_TO_REPEAT` never retries
automatically. Adapters, agents and workers MUST NOT retry.

## 56. Evidence

Provider IDs, timestamps, response metadata and artifacts persist with the
effect. Evidence is what the UI shows as "Sent".

## 57. Compensation

Applies only to state this system created. It is a new effect that
crosses the Barrier; never implicit.

## 58. Restore safety

After restore, `DISPATCHING` becomes `UNKNOWN` and is reconciled, never
redispatched.

## 59. Disable safety

Disabling a widget blocks new dispatch immediately, leaves external
objects untouched, leaves `UNKNOWN` rows for reconciliation only.

## 60. Effect timeline

Every transition, Barrier decision and reconciliation result is a
timeline entry on the Run.

## 61. Reference implementation

`mail.send` is the reference `EXTERNAL_IRREVERSIBLE` / `UNSAFE_TO_REPEAT`
capability. Every later irreversible capability copies its handling.

---

# Part VI — Control Plane and Worker Plane

## 62. Two planes

The Control Plane owns authority, ledger, audit, canonical Knowledge, the
Graphiti ingest queue, scheduling, approvals and the credential store. The
Worker Plane performs inference (including Graphiti extraction), browser
automation, embeddings and, from Phase 5, sandbox execution. Workers
produce results the Control Plane commits.

## 63. One interface

```
Worker.run(job: JobEnvelope) → JobResult

JobEnvelope { run_id, task_id,
              kind: MODEL | BROWSER | EMBEDDING | GRAPH_INGEST | SANDBOX(Phase 5),
              resource_limits, network_policy, capability_refs,
              credential_placeholders, inputs }
JobResult   { status, outputs, artifacts, evidence, error_class }
```

V1 runs both planes in one process on one machine. A remote worker is a
later implementation of this interface, not a new architecture.

## 64. Workers hold no authority

Worker output is evidence input. Workers never write the authority
database, never hold provider secrets, never call the Barrier. Tool calls
from an agent inside a worker return as proposals.

## 65. Two stores, one authority

SQLite (WAL, Control Plane single writer) is authoritative for principals,
policy, grants, effects, audit, canonical Knowledge, Skills and Assistant
memory. Graphiti's FalkorDB Lite file is derived: it MAY be wiped and
rebuilt; it MUST NOT be the only copy of any fact the product depends on.
SQLite constraints enforce invariants where SQLite can; tests cover the
rest.

## 66. Resource admission

A semaphore per class (`MODEL`, `BROWSER`, `EMBEDDING`, `GRAPH_INGEST`)
with limits from the detected profile (Part XIX). `GRAPH_INGEST` queues
behind interactive Runs. A memory reserve for OS, database and UI is
checked before admitting `MODEL` work. Work beyond capacity queues with a
visible reason; the appliance is never destabilised.

## 67. Orchestration modules

Planner (no authority) · Executor · Scheduler · Approval routing ·
Reconciliation · Artifact collection · Event intake · Graph ingest
(single graph writer) · Notifier (§129).

## 68. Automations

A schedule or event trigger that creates Runs under an `AUTOMATION`
principal with grants. Users see every Automation's standing grants in
Automate. Automations never bypass policy.

## 69. No free-running agents

No agent process persists outside a Run. Long-lived behaviour exists only
through Automations and Assistants (persistent memory, not persistent
execution).

## 70. Cancellation

The Control Plane can cancel or suspend any Task; cancellation destroys the
browser session after artifact collection and leaves in-flight effects to
the ledger.

## 71. Health

Local health for `agent-osd`, SQLite, the graph file, each worker class,
each connection. Probes MUST NOT cause external side effects. Graph health
opens the file and queries one node; it MUST NOT call a model.

---

# Part VII — Pi and Assistants

## 72. Pi

Pi is the general agent runtime. It receives typed tools from the
capability registry for the current Run — never secrets, never a generic
provider client, never Cypher.

## 73. Agent context

MAY contain: goal, persona, Knowledge hits (DATA, `trusted: false`),
Skills, Assistant memory, prior Step state, tool results, capability
descriptions. MUST NOT contain long-lived credentials, another project's
data, or `local_only` content when an external model is the target.

## 74. Tool calls are proposals

A tool call that would produce an external effect creates a `PROPOSED`
effect. The agent receives the ledger outcome (`WAITING_APPROVAL`,
`UNKNOWN`, …) as a structured result and plans around it.

## 75. Lifecycle

Execution belongs to a Run or Task, is admitted through semaphores, can be
cancelled. Output is proposal or content until validated.

## 76. Reviewer agents tighten only

A Task MAY include a reviewer agent. It can flag, block or escalate to
`ask`. It can never authorise or loosen. It is not the Barrier.

## 77. Concurrency

Concurrent agents are resolved by the ledger conflict index, not by
negotiation.

## 78. Assistants in practice

Creating an Assistant is one step: name, optional instructions. It appears
on the Home roster with presence, standing grants and recent Runs; can be
paused or deleted. Deleting revokes grants and archives memory.

In the composer `/` inserts a Skill and `@` addresses an Assistant,
Automation or connection. Neither changes policy.

## 79. Presence

Derived from Run/Task/effect state: idle, thinking, working, waiting
(approval or human), blocked, done. Hover or tap shows the current Step in
one line. The UI MUST NOT invent a "looks busy" state.

## 80. Model routing from Pi

Pi calls models only through the router (Part XI). It may request a tier
("needs strong reasoning"); the router applies project policy.

## 81. Failure legibility

When a local model cannot follow a tool schema, the Run says so plainly:
"the local model could not finish this; retry, or allow a cloud model for
this project" — never a generic error.

---

# Part VIII — Gondolin (architecture fixed; ships in Phase 5)

## 82. Why this Part exists in V1

V1 ships no sandbox. These rules are normative now so that no V1 decision
(store layout, credential handling, worker interface, browser profiles)
precludes adding coding Tasks without a redesign.

## 83. One sandbox implementation

Gondolin runs coding Tasks and risky local workloads inside a Linux
micro-VM (QEMU; libkrun where available) on every supported host — Pi 5,
Mac mini M4 / M4 Pro, DGX Spark. Profiles change count and memory, not
kind.

## 84. Host is the enforcement point

Egress is mediated by host-side policy hooks; files are served by host VFS
providers. No generic NAT, no host filesystem passthrough.

## 85. Per-Task network and filesystem

Allowlist derived from capability references; explicit mounts only (clone,
scratch, read-only inputs). Host paths, other projects, the credential
store are never mounted.

## 86. Secrets by placeholder

Credentials a sandbox needs are placeholders substituted by the host only
on allowed destinations. Secret bytes never appear in guest filesystem,
environment or memory. Scoped to one Task; expire with it.

## 87. Workspace, not a computer

A sandbox is a Task workspace with status → preview → takeover (§113). It
is destroyed after artifact collection. It never persists cookies, tokens
or files for a later Task or another Assistant.

## 88. Coding browser

Playwright inside Gondolin shares nothing with browserd (Part IX).

## 89. Artifacts and snapshots

Outputs leave only through artifact collection. Snapshots are artifacts and
contain no secret bytes.

## 90. GitHub is the first sandbox pack

Repository, installation and branch are CONTROL; issue and PR text are
DATA; the default branch is protected; PR creation is `ask`. Full
descriptor in Part XXII.

## 91. Tests gate the phase

Sandbox safety tests (Part XX, group C) MUST pass before Phase 5 ships and
are not part of the V1 gate.

---

# Part IX — Browser

## 92. browserd

`browserd` owns web-research browser execution in an isolated,
unauthenticated research profile. It is never signed in to Gmail, Calendar
or any widget account and never receives OAuth material.

## 93. Read-only research

`web.page.fetch`, `web.page.extract`, `web.search`, `web.recipe.run` are
`READ`. Navigation, scrolling, reading are allowed. Form submission that
changes state, uploads, logins and payments are not capabilities in V1.

## 94. Network policy

Named domains from policy or grants: `automatic`. Open web: an Owner
setting per project (`web.open_read`), off in `Standard`. Loopback,
RFC1918, link-local and the appliance's own addresses are blocked
regardless. Redirects are re-evaluated. DNS answers resolving to private
addresses are rejected.

## 95. Downloads

Quarantined artifacts (§37). Never executed.

## 96. Recipes

`web.recipe.run` executes a checkpointed read-only sequence saved as a
Skill. Same network policy as ad-hoc browsing.

## 97. Not a universal adapter

The browser MUST NOT reach a provider that has a governed adapter. No
Gmail or Calendar scraping.

## 98. Workspace behaviour

A browserd session is a Task workspace: status → preview → takeover
(§113). Destroyed with the Task. Never shared across Assistants.

## 99. Evidence and failure

Navigation, extraction and downloads produce timeline entries and
screenshots as artifacts. A crash fails the Step and destroys the session;
Control Plane state is unaffected.

## 100. Future authenticated profiles

A widget that later needs an authenticated browser profile gets its own
profile, namespace and policy rows. Never shared with research.

---

# Part X — Knowledge, Graphiti, memory, learning

## 101. Why Graphiti is V1

The learning story is temporal: "the vendor was X until March, then Y";
"what did we believe when this approval happened". FTS5 plus a
`superseded_at` column answers only the latest state. Graphiti gives
invalidation, history and point-in-time search, and makes an Assistant feel
like it learned rather than cached. Its cost is bounded by §102–§104.

## 102. Rule one: derived, never authority

Canonical Knowledge (files, saved pages, Skills, memory rows, kept Run
summaries) lives in SQLite. Graphiti (episodes, entities, bi-temporal edges)
is rebuildable from it. Losing the graph file is an incident, not data
loss. FTS5 over canonical SQLite MUST keep answering while the graph is
rebuilding or unhealthy.

## 103. Rule two: behind `knowledge.search`

Pi and the UI see `knowledge.search`, `knowledge.get_source`,
`knowledge.suggest_correction`, `knowledge.write`. Nobody sees Cypher, a
Graphiti admin client, or the word "graph" in Member UI. Members see "this
was true from … to …".

## 104. Rule three: degrades to raw episodes

If the router refuses (policy, `local_only`, budget) or the local model
cannot produce structured output, the episode is stored as raw text: FTS5
searchable, an `EpisodicNode` without edges. The Run and the Knowledge
item are never blocked. Home shows "indexed for search, not yet
connected".

## 105. Engine and backend

`graphiti-core` in-process. LLM client and embedder are the model router.
It MUST NOT default to OpenAI, MUST NOT read `OPENAI_API_KEY` unless that
key belongs to a configured `model_provider` Connection and policy permits
external inference, MUST NOT call Zep Cloud. Backend: FalkorDB Lite
embedded file. Forbidden: Neptune, Kuzu. Neo4j / FalkorDB server are
non-default later options.

## 106. Partitioning

`group_id = project_id` for project Knowledge, Skills, memory, Run
episodes; `org:<id>` for organisation Knowledge. Search, ingest and delete
are always scoped to one `group_id`. Sharing copies canonical sources and
re-ingests; it never unions groups at query time.

## 107. Ingest

Canonical writes enqueue a `GRAPH_INGEST` job. `add_episode` receives the
canonical text (or bounded excerpt), `reference_time` = when the fact
occurred (never "now" for historical material), `group_id`, and a
`source_description` carrying SQLite id, Run id and model tier.

## 108. Bi-temporal facts

`valid_at`, `invalid_at`, `created_at`, `expired_at`. Contradictions
invalidate; they do not delete. Point-in-time search is supported and is
DATA. The ledger, not the graph, is authoritative for whether an effect
dispatched.

## 109. Retrieval

`knowledge.search` runs Graphiti hybrid search (semantic + BM25 + graph
rerank) inside the Run's `group_id`, merged with FTS5 hits. Every hit
carries source id, episode id, edge id, `valid_at`, model tier, and
`trusted: false`.

## 110. Local embeddings and `local_only`

Embeddings use `local_small` on every profile. Any source may be marked
`local_only`; its ingest MUST use a local tier or stop at a raw episode. It
is never sent to an external embedder or extractor.

## 111. Skills

A Skill is a canonical document with steps, decision rules, expected
output and safety notes. Ingest creates a Skill entity and `used_in` /
`depends_on` edges. Agents MAY write a Skill after a Run without approval
because it is DATA. Humans open, edit, delete, or mark `REVIEWED`. A Skill
never widens authority.

## 112. Teach once

A user says "save this as a Skill" or "do this every Monday". The
Assistant shows a **Skill preview card** before saving: title, editable
numbered steps, which capabilities it will propose, which will need
approval, and any recipients or sites it mentions marked "you will still
confirm these". Saving creates the Skill; "every Monday" additionally
creates an Automation whose standing grants are shown on the same card.
The demonstration becomes an episode with `reference_time` = the Run's
time. Teaching installs nothing and widens no grant.

## 113. Workspace: status, preview, takeover

When browserd (or, later, Gondolin) is active for a Task the Assistant card
and chat title-bar show it. Preview is a side panel; closing it does not
cancel work. Takeover is full-screen human control of that Task's session,
then hand-back. Passwords, 2FA and CAPTCHAs typed during takeover apply to
that session only and MUST NOT be stored as memory or episodes. The
workspace is destroyed with the Task.

## 114. Assistant memory

Observational (rolling summaries) and episodic (index of prior Runs), as
canonical SQLite rows in the home project, ingested into that `group_id`.
Users open, correct and delete entries from the Assistant's card. Memory is
DATA. If a fact cannot be shown to a human, it MUST NOT be used in a
prompt.

## 115. Consolidation

After a Run completes, a low-priority `GRAPH_INGEST` job writes the Run
summary, redacted important tool results and any new Skill. Failure leaves
the Run complete; the graph catches up.

## 116. Correction, deletion, retention, rebuild

A correction is a new canonical row plus episode; Graphiti invalidates the
old edge rather than deleting history. Deleting a source removes its row,
FTS5 entries and graph nodes for that episode. Defaults: Knowledge
indefinite, memory 365 days, artifacts 180 days, audit indefinite. Admin →
System offers "rebuild graph" per `group_id` or all; SQLite is untouched
and FTS5 serves during rebuild.

## 117. What Graphiti is not

It MUST NOT store policy, grants, credentials, effect state or approvals.
The Dispatch Barrier MUST NOT read it. It is not a back door to Gmail.

---

# Part XI — Models: local, hybrid, API

## 118. Tiers and the `Standard` bundle

```
local_small    always present: embeddings, classification, summarisation, cheap drafting
local_large    present on standard and pro: agent reasoning and tool use
external       API providers, if an Owner has connected one

Standard bundle
Gmail       search, read automatic · draft automatic · send ask · label apply ask
Calendar    search, read automatic · create ask · update ask · respond ask · delete off
Web         named domains automatic · open web off
Models      local automatic · external per onboarding answer (off | ask | automatic)
Knowledge   search automatic · write automatic (project) · share off · graph ingest automatic (local)
```

## 119. External inference is data egress

`model.infer.external` has `leaves_company = true` and is evaluated per
project like any capability. The UI says "send this to a cloud model?",
never "egress effect".

## 120. Providers are Connections

External providers and local model servers are `model_provider`
Connections with health and epochs. Keys live in the credential store and
never enter agent context or browsers.

## 121. Router rules

Per project `model.routing`:

- `local_only` — "Keep everything on this machine"
- `hybrid` — "Use our machine first; ask before a cloud model"
- `external_preferred` — "Prefer a cloud model when allowed"

Graphiti extraction and embeddings obey the same rules. A `GRAPH_INGEST`
that would need `external` when it is `off` stores a raw episode (§104).

## 122. Profile defaults

`lite` defaults to `hybrid` with external at `ask` (no useful local agent
model). `standard` and `pro` default to `local_only`.

## 123. Weaker models raise friction, not risk

Small local models produce more `FAILED` and more stop-and-explain. The
kernel makes that safe; §81 makes it legible.

## 124. Model evidence

Each Step records tier and Connection so audit can answer "did any of
this leave the machine".

---

# Part XII — User interface

## 125. Five objects

Members see Assistants, chats, Skills, tools (as "what Kenny can do") and
artifacts. They do not see Project (until a second exists), Task, Step,
Effect, epoch, profile, budget (until 80%), or graph. Those live in the
Inspector and Admin.

## 126. Surfaces

- **Home**: Assistant roster with presence; "needs you" (approvals,
  blocked, UNKNOWN); recent evidence ("Sent to Sarah 10:41"); health,
  including whether the tailnet is up.
- **Chat**: heterogeneous transcript — prose, approval cards, artifacts,
  inline widgets (draft mail, table), system events ("saved Skill *Weekly
  vendor scan*").
- **Work**: Runs, timeline, artifacts, workspace preview, Inspector.
- **Apps**: widgets with separate indicators Connected · Available ·
  Actual authority · Approval required · Health.
- **Automate**: Automations and their standing grants.
- **Knowledge**: sources, Skills as openable documents, memory entries,
  facts with validity windows.
- **Approvals**: pending and past.
- **Admin**: Overview, People, Widgets, Policies, Budgets, Audit, Backup,
  Updates, System.

## 127. First paint is local

Home renders from SQLite before any provider is contacted. Provider tiles
show last refresh; an outage degrades a tile, not the page.

## 128. Honest state

Proposed, running, waiting for you, sending, couldn't confirm, done, failed
are always distinct. "Sent" appears only with evidence.

## 129. Notifications

V1 ships one channel: email to the approver's own address via the
organisation's connected Gmail, plus the mobile web badge. A `WAITING_APPROVAL`
older than 5 minutes sends one notification; `UNKNOWN` sends one to Owners.
Notifications contain no message bodies. More channels are deferred.

## 130. Mobile

Approve, deny, read a Run, message an Assistant — all MUST work from a
phone through the web UI, reached over the tailnet (§178). The phone
runs a Tailscale client; there is no public mobile app store listing in
V1 and no APNs/FCM push path.

## 131. Inspector

For any Run, Task or Effect: CONTROL and DATA, trust flags, provenance,
policy version, connection epoch, Barrier decision, evidence, AuditEvents.

## 132. Onboarding — ten minutes

1. Create the Owner account and see the recovery key once.
2. "Allow cloud models? No / Ask / Yes."
3. Connect Gmail (Calendar is one more tap, optional now).
4. Name your first Assistant.
5. Ask it to summarise today's inbox (read, automatic).
6. Ask it to draft a reply; tap Send on the approval card; see the
   grant-from-approval offer.
7. Open Admin → Audit and see the row.

The wizard ends when the Owner has seen connect → read → approve → send →
audit once. Hardware profile is detected silently (§163). Joining the
tailnet is offered after that loop and MUST NOT block the first send:
the desk UI is loopback (§178).

---

# Part XIII — Approvals

## 133. Purpose

Approvals exist for authority transitions policy does not allow
automatically, and for creating grants. They are not general confirmation
dialogs; read capabilities never produce one.

## 134. Card content

Every CONTROL value; content-relevant DATA or a faithful rendering; the
acting connection identity; expiry; "this sends company data outside the
company" where `leaves_company`; the grant-from-approval offer (§42, §43).

## 135. Digest binding

Approving binds to the effect digest. Change the effect and the card is
withdrawn and re-presented.

## 136. Eligibility and absence

Owners and Members with an approver flag for the project. Evaluated at
decision time. Auditors cannot approve. Members can mark absence; routing
skips them. With no eligible approver the effect stays `WAITING_APPROVAL`
with a visible "no one can approve this"; never bypassed.

## 137. Expiry and batch

Default 24 h. Multiple effects from one Run MAY be listed together; each is
approved individually.

## 138. Audit

Every approval, denial, expiry and grant-from-approval is an AuditEvent.

---

# Part XIV — People and roles

## 139. Roles

```
Owner     governance: policy, widgets, connections, people, budgets, backup, updates
Member    use Assistants and granted capabilities; own USER_OAUTH connections; may hold approver flag
Auditor   read-only audit, policy and effect visibility; cannot approve or connect
```

Auditor and Owner are mutually exclusive. At least one Owner always exists;
the last Owner cannot be revoked, suspended or demoted (enforced in the
database).

## 140. Schema

```
principals(id, organisation_id, kind, email, display_name, status,
           auth_subject, auth_epoch, created_at, created_by, revoked_at)
role_bindings(id, principal_id, role, granted_by, granted_at, expires_at,
              UNIQUE(principal_id, role))
project_memberships(project_id, principal_id, approver, added_by, added_at,
                    PRIMARY KEY(project_id, principal_id))
```

## 141. Auth epochs

Revocation, authentication reset or a sensitive change increments
`auth_epoch`. Sessions, in-flight Runs and effects on an older epoch fail
at the API and the Barrier.

## 142. Bootstrap

Organisation → first `HUMAN` → Owner binding → default project → recovery
key shown once → commit atomically. No vendor account remains.

## 143. Invitations and departure

Owners invite by email; invitations expire. Revoking a person disables
their `USER_OAUTH` connections, removes memberships, voids pending
approvals, and flags shared connections they owned for reassignment.

## 144. Break-glass

For total Owner authentication loss: host access plus the recovery key.
`agent-os reset-owner` restores or replaces Owner authentication, rotates
the key, writes an AuditEvent, authorises nothing else. No vendor path.

## 145. Client distrust and sessions

The browser client never decides authority. Sessions bind to principal and
epoch, expire, and can be revoked individually.

---

# Part XV — Widgets and connections

## 146. Widget contents

Immutable version tied to the appliance release; capability descriptors;
one adapter with one narrow method per capability; connection kinds; card;
side-effect-free health check; `risk_text`.

## 147. In-repo, versioned with the appliance

V1 widgets ship inside the appliance release. No runtime installation by
anyone.

## 148. Enablement and connection grant nothing

Enabling exposes capabilities to policy tables as `off`. Connecting stores
reach.

```
connections(id, widget, kind, subject_identity, owner_principal_id,
            status, epoch, health, created_at, revoked_at)
connection_projects(connection_id, project_id, exposed_by, exposed_at)
status ∈ { DRAFT, CONNECTED, DISABLED, ORPHANED, REVOKED }
```

## 149. Connection protocol

Connect → `DRAFT` → provider OAuth → verify identity server side → store
credential → `CONNECTED` → health loop. Tokens never leave the credential
store except inside adapter calls in the Control Plane.

## 150. Who may connect; orphaning; epochs

Members connect their own `USER_OAUTH` identity. Shared accounts and model
provider keys require an Owner. A shared connection whose Owner is revoked
becomes `ORPHANED` and cannot dispatch until reassigned. Reauthorisation,
scope change or rotation increments the epoch; older effects are blocked.

## 151. Adapter contract

Typed CONTROL and DATA inputs; structured evidence; stable error classes
(`AUTH`, `RATE_LIMIT`, `NOT_FOUND`, `CONFLICT`, `TRANSIENT`,
`UNKNOWN_OUTCOME`); never retry irreversible calls; no generic "request"
method.

## 152. Provider ceiling

Provider scope may reduce what a capability can do. It never increases
authority.

---

# Part XVI — V1 packs

## 153. Catalog

```
gmail            mail.*
google_calendar  calendar.*
web_research     web.*
model_provider   model.*
```

GitHub is Phase 5 (Part XXII). Slack, Notion, CRM, Microsoft are not
planned for V1 or Phase 5.

## 154. Gmail

Connections: `USER_OAUTH`, `SHARED_ACCOUNT` (Owner).

```
mail.search        READ
mail.read          READ
mail.draft         EXTERNAL_REVERSIBLE   IDEMPOTENT (draft key)
mail.send          EXTERNAL_IRREVERSIBLE UNSAFE_TO_REPEAT  leaves_company
mail.label.read    READ
mail.label.apply   EXTERNAL_REVERSIBLE   IDEMPOTENT
```

Sender, to/cc/bcc, attachment identities and thread target are CONTROL.
Subject and body are DATA but content-relevant for the digest. Send
approval binds sender, recipients, subject, body, attachments, thread,
draft version. A draft approval never authorises a send. Every outgoing
message carries an idempotency header; reconciliation of `UNKNOWN` searches
Sent by it. No scraping.

## 155. Google Calendar

```
calendar.search    READ
calendar.read      READ
calendar.create    EXTERNAL_REVERSIBLE   RECONCILIABLE (client key)  leaves_company if external attendees
calendar.update    EXTERNAL_REVERSIBLE   RECONCILIABLE (ETag)
calendar.delete    EXTERNAL_IRREVERSIBLE UNSAFE_TO_REPEAT
calendar.respond   EXTERNAL_REVERSIBLE   IDEMPOTENT
```

Calendar, attendees, event ID and time are CONTROL; title and description
are DATA. Updates bind ETag; mismatch fails. Compensation deletes only
system-created events; `calendar.delete` is `off` by default.

## 156. Web Research

`web.page.fetch`, `web.page.extract`, `web.search`, `web.recipe.run`, all
`READ`. Part IX applies.

## 157. Model providers

`model.infer.local` (`READ`-class, budgeted in minutes on `lite`),
`model.infer.external` (`EXTERNAL_REVERSIBLE`, `leaves_company`),
`model.embed.local`, `model.embed.external`.

---

# Part XVII — Audit, credentials, secrets

## 158. AuditEvent

Append-only: policy changes, grants, roles and memberships, connection
lifecycle, approvals and denials, Barrier decisions, dispatch outcomes,
reconciliation, Knowledge sharing, break-glass, backups, updates. Actor,
correlation, before/after, timestamp. Owners cannot delete rows.

## 159. Sensitive logging

Secrets, message bodies beyond the digest, unnecessary personal data are
excluded. Evidence is referenced, not copied.

## 160. Credential store

One encrypted store readable only by the Control Plane process, keyed from
local boot material plus the recovery material for backup encryption.
Agents and browsers see logical references only. Rotation and revocation
increment connection epochs. Redaction by pattern and known value.

## 161. Minimum scope and host separation

Scopes requested are the minimum for enabled capabilities; widening
triggers reauthorisation and a new epoch. Worker processes run as a
separate OS user with no read access to the credential store or authority
database.

## 162. Admin Overview

Health, tailnet up/down, orphaned connections, expired grants, failed
backups, `UNKNOWN` effects awaiting a human, recent high-impact audit
events.

---

# Part XVIII — Backup, release, updates, hardware

## 163. Hardware is detected

On first boot the appliance inspects CPU, memory and accelerator and
selects a profile (Part XIX). Onboarding shows one sentence — "This Mac
mini will keep everything on this machine" — and no picker. Owners may
override in Admin → System; a change is a restart.

## 164. Backup

SQLite, graph file, configuration, canonical sources, artifacts, encrypted
credential blob with recovery metadata. Encrypted with recovery material.
Targets: local disk, attached drive, organisation object store. The vendor
never receives backups. Default retention daily 14 days, weekly 8 weeks.

## 165. Restore

Preserves logical IDs. `DISPATCHING` → `UNKNOWN`. Connections restored
`CONNECTED` only if credentials decrypt and health passes, else
`DISABLED`. A missing graph file queues a rebuild; canonical data is live.
Admin → Backup has "test restore" into a scratch database; a strategy
without a passed test is shown as incomplete.

## 166. Image, channels, staged updates

Signed appliance image; `stable` and `early` channels; signatures verified
before staging; activation by Owner or window; rollback where migrations
permit; explicit versioned migrations with automatic pre-migration backup
for high-risk ones. New capabilities arrive `off`.

---

# Part XIX — Profiles (detected)

## 167. Profiles are configuration

```
memory_reserve_mb
limits: { MODEL, BROWSER, EMBEDDING, GRAPH_INGEST, SANDBOX(Phase 5) }
graph_backend: falkordb_lite | falkordb
tiers: { local_small, local_large | none }
routing_default: local_only | hybrid | external_preferred
```

Architecture and tests are identical across profiles.

## 168. `lite` — Raspberry Pi 5

8–16 GB, no accelerator. BROWSER 1 · EMBEDDING 1 · GRAPH_INGEST 1 ·
local_large none · local_small a small CPU model. FalkorDB Lite. Routing
`hybrid`, external `ask`. Graph ingest commonly stores raw episodes until a
cloud model is allowed; FTS5, approvals and Gmail send work fully.

## 169. `standard` — Mac mini M4 / M4 Pro

24–64 GB unified. BROWSER 1 · GRAPH_INGEST 1 · local_large a ~30B-class
quantised model (M4 Pro MAY load a larger quant within the reserve).
FalkorDB Lite. Routing `local_only`. The reference appliance.

## 170. `pro` — DGX Spark

128 GB unified, ~273 GB/s. BROWSER 2 · GRAPH_INGEST 2 · local_large up to
~200B-parameter NVFP4 MoE. FalkorDB Lite default; FalkorDB server optional.
Routing `local_only`. Inference memory is capped well below the pool. More
capacity; not more authority.

## 171. What a Pi may drop; what Spark may not add

A Pi drops `local_large` and connected graph facts. It keeps the kernel,
roster, approvals, FTS5 and send. A Spark adds slots and a bigger local
model. It MUST NOT add a shared desktop, a second Barrier, or a graph the
Barrier reads.

## 172. Worker machines later

A remote worker binds `Worker.run` to another node. Control Plane, SQLite,
graph file, credential store and audit stay on one machine.

---

# Part XX — Safety properties

## 173. Group A — V1 gate (all MUST pass before first release)

1. last Owner cannot be revoked, suspended or demoted
2. Auditor cannot approve any effect or create a connection
3. enabling Gmail does not permit send
4. connecting Gmail does not permit send
5. OAuth scope breadth does not create mail authority
6. mail draft approval cannot authorise send
7. changed approved recipient invalidates approval
8. changed approved body invalidates approval
9. web-derived recipient does not become trusted CONTROL
10. ambiguous Gmail send becomes UNKNOWN and reconciles; never retried
11. two effects on one thread cannot be in flight together
12. research browser cannot read any widget credential
13. open web browsing blocks loopback, RFC1918 and link-local; redirects revalidated; DNS rebinding blocked
14. Home renders with all providers offline
15. project A authority, Knowledge and memory cannot leak to project B
16. revoked user loses authority on next request; stale sessions fail after epoch change
17. policy narrowing blocks a stale effect; widening does not retroactively authorise
18. connection revoke, epoch bump or ORPHANED state blocks dispatch
19. calendar attendee cannot be injected from description text
20. stale calendar update (ETag mismatch) does not overwrite
21. compensation cannot delete a pre-existing event
22. a Skill or `/` insertion cannot widen authority
23. Assistant memory content cannot become trusted CONTROL
24. `local_only` Knowledge is never included in an external model prompt or embedding request
25. external model provider key never appears in agent context or browser
26. health probes produce no external side effects
27. Owner UI actions still cross the Dispatch Barrier
28. new capabilities in an update arrive as `off`; runtime widget installation is impossible
29. restored DISPATCHING effects become UNKNOWN and are not redispatched
30. a reviewer agent cannot allow an effect the Barrier blocks
31. takeover 2FA or password is not stored as memory or episode; workspace leftovers cannot be used by a later Task
32. memory the product cannot show to a human is not included in a prompt
33. first-run to governed send completes in the onboarding wizard without opening Admin (except the audit step)
34. Member UI is not reachable on a physical NIC address (only loopback and the tailnet interface / `tailscale serve`)
35. presence on the tailnet without an Edge session cannot read, approve or dispatch
36. Tailscale Funnel and any public ingress cannot be enabled from Admin
37. the desk UI still serves when Tailscale is stopped; in-flight effects are unaffected

## 174. Group B — Graphiti gate (MUST pass before Graphiti extraction is enabled)

38. a Graphiti-extracted email, name or URL cannot become trusted CONTROL
39. search from project A cannot return project B nodes
40. Graphiti never uses OpenAI unless a `model_provider` Connection and policy allow
41. `local_only` sources never reach an extractor or embedder that leaves the machine
42. losing the graph file loses no canonical Knowledge; rebuild restores it
43. the Dispatch Barrier does not read Graphiti
44. Pi cannot call Cypher or an admin client
45. Knowledge search still returns FTS5 hits when Graphiti is unhealthy
46. human correction invalidates the old edge rather than deleting history
47. graph health probes do not call a model

## 175. Group C — sandbox gate (Phase 5)

48. guest never observes secret bytes; placeholders substitute only on allowed hosts
49. sandbox cannot reach hosts outside its Task allowlist
50. Gondolin Playwright cannot access browserd profiles
51. untrusted issue text cannot change target repository or branch
52. signed webhook payload instructions are not trusted; duplicate deliveries do not duplicate Runs
53. clone credentials do not persist beyond the Task

---

# Part XX.A — Reachability (Tailscale)

These sections are V1. They do not create a second authority path.

## 176. Path, not principal

Humans reach the Presentation layer over a Tailscale tailnet when they
are away from the appliance, and over loopback when they sit at it.
Joining the tailnet, knowing the MagicDNS name, or holding a tailnet IP
MUST NOT create an Edge principal, session, role, grant or approval.
Tailscale is a path. An Edge login is still required (§145).

## 177. Listeners

`agent-osd` binds the Member UI to `127.0.0.1` and to the appliance's
Tailscale interface (or exposes that same local port with
`tailscale serve`). It MUST NOT bind the Member UI to `0.0.0.0` on
physical NICs. Cafe Wi-Fi and the office LAN are not an access path.

It MUST NOT enable Tailscale Funnel, a public A record, ngrok, or a
reverse proxy on the open internet.

`agent-os reset-owner` remains a host-console command and MUST work when
the tailnet is down.

## 178. Desk and phone

At the appliance the Owner opens the loopback URL. No Tailscale client
is required. That is how the ten-minute first send stays true.

Away from the appliance, Home and approvals are the MagicDNS name over
the tailnet. A phone MUST run a Tailscale client before the mobile web
UI will load. Notification mail (§129) links to that MagicDNS URL and
contains no message bodies.

## 179. Overlay vs vendor root

Tailscale is an overlay the organisation chooses. It is not a vendor
principal, not a support backdoor, and not a path for the Edge vendor to
SSH. Auth keys, tags and ACLs live in the organisation's Tailscale
account. The appliance stores a machine identity sufficient to stay
joined; rotation is an Owner action and an AuditEvent.

## 180. Failure

If the tailnet is down: the desk UI still works; away clients see "can't
reach the appliance"; Automations, Gmail effects and local models
continue; Home shows the tailnet as unhealthy. A tailnet outage MUST NOT
fail in-flight effects or invent `UNKNOWN`.

## 181. What is not a path

Forbidden in V1 as a Member path: Tailscale Funnel, Cloudflare Tunnel,
ngrok, a public load balancer, raw WAN port-forwarding. Other overlays
(plain WireGuard, ZeroTier, Headscale) are deferred (Part XXII) and MUST
NOT relax §177.

## 182. Closing reachability law

Path ≠ login ≠ grant. The phone uses Tailscale to see Kenny. The Barrier
still decides whether mail leaves.

---

# Part XXI — Build order

```
Phase 1  Kernel
         SQLite schema, Owner/Member/Auditor, auth epochs, default project,
         AuditEvent, credential store, bootstrap, reset-owner, sessions

Phase 2  Effect law
         capability registry, policy table + Standard bundle, grants,
         grant-from-approval + in-company default, Effect Ledger, digest
         approvals, Dispatch Barrier, conflict index, reconciliation,
         budgets, approval routing, absence, notifier

Phase 3  Runtime
         agent-osd modules, Worker interface, semaphores, detected profiles,
         Pi with generated tools, browserd with research profile, model
         router with local_small and one external provider, UI listeners
         on loopback + Tailscale only (§177)

Phase 4  Product
         Home roster + presence, chat transcript with cards and widgets,
         Work + Inspector, Apps, Automate, mobile web, Assistants,
         workspace status/preview/takeover, Knowledge canonical + FTS5,
         Graphiti (FalkorDB Lite, router-bound), Skills, teach-once preview
         card, inspectable memory, onboarding wizard, graph rebuild

Phase 4b Packs, in order
         Gmail read/search → Gmail draft → Gmail send (reference) →
         Calendar → Web Research (named domains) → local_large on
         standard/pro → Graphiti extraction on (Group B green)

Phase 5  Coding
         Gondolin, GitHub pack, coding browser, Group C green

Phase 6  Hardening
         Group A green, backup + test restore, signed image, channels,
         staged update, worker OS user, profile tuning on Pi 5, M4, M4 Pro,
         Spark

Phase 7  Second wave from Part XXII by customer evidence
```

---

# Part XXII — Deferred

- **GitHub pack + Gondolin coding sandboxes** (Phase 5). Descriptor:
  `repo.issue.read`, `repo.issue.comment`, `repo.pr.read`,
  `repo.pr.create` (ask), `repo.pr.request_review`, `repo.webhook.ingest`,
  `repo.git.clone`; GitHub App connection; PAT break-glass only; merge to
  default branch not a capability.
- Group threads (several Assistants, humans, `@` between Assistants)
- Cautious and Trusting bundles; profile picker in onboarding
- Manager and Admin roles; `SERVICE` principals
- L0–L3 autonomy; policy draft/validate/diff/publish engine
- Independently signed widget packages; third-party adapters; MCP as an
  adapter transport (still behind the Barrier; never required for V1 packs)
- Cluster: worker leases, node identity, placement, PostgreSQL
- Chat channels (Slack, Telegram, WhatsApp) as inbound events and approval
  surfaces; push notifications beyond email + badge
- Shared mailboxes for Members; open-web form submission, logins, uploads
- Full trust-class lattice; V1 uses `trusted` + provenance
- Timed break-glass ceremony; V1 is `reset-owner`
- Neo4j / FalkorDB server backends; Zep Cloud (forbidden, not deferred)
- Slack, Notion, CRM, Microsoft packs
- Other overlays as a Member path: Cloudflare Tunnel, Funnel, ngrok,
  plain WireGuard, ZeroTier, Headscale; public A records; WAN
  port-forwards. Tailscale remains the V1 path (§176).

---

# Part XXIII — Implementer checklist

1. Is this a surface, an authority or a provider ceiling?
2. Did enabling or connecting anything create authority?
3. Which fields are CONTROL, and can untrusted DATA alter them?
4. Which policy row, grant and connection epoch are checked at dispatch?
5. What happens after narrowing, revocation or an epoch bump?
6. If the provider response is lost, is retry safe? How is UNKNOWN reconciled?
7. What conflict key protects the resource?
8. Which runtime executes this and what can it see?
9. Does any company data leave the machine, including inside a prompt, extraction or embedding?
10. Can a Skill, memory row, graph edge, webpage or webhook make this happen without a human trust transition?
11. Does SQLite enforce the invariant, or only the code? Would losing the graph file lose it?
12. Which Part XX test covers it, and which gate?
13. Did a workspace, cookie or Skill become reach or authority?
14. Can a Member finish this from Home without opening Admin?
15. Does this add a concept to the Member UI? Which of the five objects is it?
16. Is this reachability, a login, or a grant? (Tailscale is only the first.)

If any answer is unclear, the feature is not ready.

---

# Part XXIV — Closing

Agentic OS Edge is a governed execution system with a teammate on top.
Humans govern. Policy defines authority. Assistants propose. Approvals bind
exceptional authority. The Dispatch Barrier decides whether an effect may
leave. Adapters talk to providers. The Effect Ledger records what was
attempted. Reconciliation determines what happened. Artifacts and Audit
keep the evidence. Graphiti remembers how facts changed without becoming
authority. Skills and memory make Assistants better at proposing in the
open. browserd, and later Gondolin, keep untrusted execution away from
everything that matters, on a Pi or a Spark alike.

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
workspace leftover ≠ grant
presence ≠ authority
`@` mention ≠ grant
reviewer model ≠ Barrier
capacity ≠ authority
graphiti ≠ kernel
owner ≠ root
browser ≠ universal adapter
widget ≠ kernel
tailnet ≠ login
path ≠ grant
```

Everything may propose. Only explicit authority may decide. Only the
Dispatch Barrier may let an external effect leave. After it leaves,
evidence, not optimism, determines what happened.

The person sees Kenny. The machine sees a Run. The Barrier sees a digest.
Ten minutes from boot to the first governed send — on the machine you
already own.
