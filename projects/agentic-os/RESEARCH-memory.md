# Research: agentic OS memory, graph databases, and Graphiti

Date: 2026-09-09 (updated same day)
Status: survey. **Normative decision is SPEC.md v7.0 (Graphiti since v6.1): Graphiti is V1 as a derived index, bounded by three rules (derived never authority; behind `knowledge.search`; degrades to raw episodes).**

The survey below still stands as background. The v6.0 recommendation "do not put Graphiti in V1" is superseded. v6.1 uses Graphiti as a derived index with FalkorDB Lite, router-bound extraction, `group_id` = project, and graph facts as DATA.

---

---

## 1. The field has split into two products

"Agent OS" and "agent memory" are no longer the same thing.

| Kind | Examples | What they own |
| --- | --- | --- |
| Full runtime / OS analogue | Letta (MemGPT), Hermes Agent, Grok Bot, Agentic OS Edge | loop, tools, persistence, often UI |
| Memory layer bolted onto any agent | Graphiti/Zep, Mem0, Cognee, LangMem, CrewAI Memory | extract, store, retrieve |
| Plugin onto a runtime | Hermes providers, OpenClaw Cognee/Zep/Mem0 plugins | same as memory layer, via a hook |

Agentic OS Edge is in the first column. Graphiti is in the second. Mixing them without a boundary is how other products accidentally made "remembered" into "authorised".

---

## 2. Graphiti / Zep — the graph everyone means

[Graphiti](https://github.com/getzep/graphiti) is Zep's open-source temporal knowledge graph. [Zep](https://www.getzep.com/ai-agents/temporal-knowledge-graph/) is the hosted platform that runs Graphiti at scale on a proprietary Context Graph Engine. The paper is [arXiv 2501.13956](https://arxiv.org/html/2501.13956): on LongMemEval, Zep reports up to 18.5% accuracy gain and ~90% lower latency versus naive RAG; on DMR it beats MemGPT 94.8% vs 93.4%. Independent write-ups cite LongMemEval GPT-4o scores of 63.8% (Zep) vs 49.0% (Mem0) ([particula.tech](https://particula.tech/blog/agent-memory-frameworks-tested-mem0-zep-letta-cognee-2026)).

### Data model

Four node types: `EpisodicNode` (raw episode), `EntityNode` (extracted entity + embedding), `CommunityNode` (cluster summary), `SagaNode` (narrative chain). Five edge types, of which `EntityEdge` is the fact ([DeepWiki data model](https://deepwiki.com/getzep/graphiti/3.1-knowledge-graph-data-model)).

Every partition has a `group_id` (multi-tenancy). Canonical text is kept as the episode; extracted entities and facts are derived.

### Bi-temporal edges ([docs](https://getzep-graphiti.mintlify.app/concepts/temporal-model))

| Field | Meaning |
| --- | --- |
| `valid_at` / `invalid_at` | when the fact was true in the world |
| `created_at` / `expired_at` | when the system learned / superseded it |

Contradictions invalidate; they do not delete. That is the feature vector DBs lack, and the reason Graphiti exists. Point-in-time queries ("who was CEO in 2023?") are first-class.

### How a write actually works

`add_episode(name, episode_body, reference_time)` → LLM extracts entities and edges → resolve against existing nodes → temporally invalidate contradictions → embed → store. Retrieval is hybrid: semantic embeddings + BM25 + graph-distance rerank.

The LLM is on the write path. Graphiti defaults to OpenAI (`gpt-4o-mini` + `text-embedding-3-small`). Local models via Ollama/vLLM are supported, but the docs warn that providers without structured output produce bad schemas, especially small models ([installation](https://getzep-graphiti.mintlify.app/installation)). Ingestion is concurrent (`SEMAPHORE_LIMIT`, default 10). This is a cost, latency, and privacy problem on an appliance that wants `local_only`.

### Storage backends ([README](https://github.com/getzep/graphiti))

| Backend | Role | Appliance fit |
| --- | --- | --- |
| Neo4j 5.26+ | default | extra server; not for Pi / Mac mini solo |
| FalkorDB 1.1.2+ | Redis-protocol graph | Docker sidecar |
| Amazon Neptune | cloud | contradicts private-by-default |
| Kuzu 0.11.2 | embedded | **deprecated**; upstream archived |
| FalkorDB Lite | embedded file, no Docker | Linux/macOS, Python 3.12+, single-process; vector recall reported weaker than full FalkorDB ([issue 1240](https://github.com/getzep/graphiti/issues/1240)) |

Zep Cloud does not require a third-party graph DB; it uses their own engine. Self-hosting Graphiti does.

A community fork, [Temporal](https://github.com/DomLynch/Temporal), strips Graphiti to ~2,800 LOC on SQLite WAL (same `valid_at`/`invalid_at`, no Neo4j). That is the closest "Graphiti ideas without a graph server".

Kuzu's successor is [LadybugDB](https://github.com/LadybugDB/ladybug/) (embedded Cypher + native vector index). Graphiti has not adopted it; do not depend on Kuzu.

### What Graphiti is good for

- Facts that change (job titles, vendors, project ownership)
- "What did we know when we approved that send?"
- Multi-hop ("who reports to the person who owns calendar X")
- Combining chat episodes with structured business JSON

### What Graphiti is not

- Not a capability / policy store
- Not an effect ledger (no UNKNOWN, no Barrier)
- Not local-first by default (OpenAI on the write path)
- Not a drop-in for SQLite-only V1
- Not a trust upgrade: extracted emails, names, and "send this to X" remain untrusted content. Graphiti does not know CONTROL vs DATA.

---

## 3. How other agent OS implementations handle graphs

### Letta (MemGPT) — OS memory, not a graph

[Letta](https://www.letta.com/blog/agent-memory/) is the closest conceptual cousin to Agentic OS Edge: context window as RAM, archival as disk, the agent paginates via tools. State lives in PostgreSQL or SQLite ([noze](https://www.noze.it/en/insights/letta-memgpt/)).

Tiers ([memory-architecture.md](https://github.com/letta-ai/skills/blob/HEAD/letta/letta-api-client/memory-architecture.md)):

- Core memory blocks always in context (`persona`, `human`, custom)
- Recall: searchable conversation history
- Archival: semantic passages; "can be vector or graph" as a tool backend, not as the kernel

Sleep-time agents consolidate asynchronously. Shared blocks coordinate multi-agent. **No native graph DB.** If you want a graph you attach it as a tool. That is the right split.

### Hermes Agent — files + SQLite, graph as a plugin

[Hermes memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory):

| Tier | Store | Loaded when |
| --- | --- | --- |
| Frozen prompt | `MEMORY.md`, `USER.md` under `~/.hermes/memories/` | every session, char-capped (~800 / ~500 tokens) |
| Episodic | `~/.hermes/state.db` SQLite FTS5 | on `session_search` |
| Procedural | `~/.hermes/skills/` markdown | lazy: names first, body on match |

The agent writes its own memory (optional `write_approval`). Background skill creation after repeated successful tool-heavy tasks ([devcheolu](https://devcheolu.com/en/posts/bazTa4ho2UCc7DZZpif0)).

"Skill graph" ([PR 50057](https://github.com/NousResearch/hermes-agent/pull/50057), [nuffin/hermes-skill-graph](https://github.com/nuffin/hermes-skill-graph)) is **not Graphiti**. It is three SQLite tables (`skill_nodes`, `skill_edges`, `skill_fts`) so the agent can discover skills without stuffing a flat index into the system prompt. Optional providers (Mem0, Honcho, Hindsight, Supermemory, …) run *alongside* the files, never replacing them.

This is the closest operational model to Agentic OS Edge V1: files/SQLite first, graph optional, skills as documents.

### Grok Bot — no graph, opaque memory, shared computer

[xAI overview](https://docs.x.ai/grok-bot/overview) and [bots](https://docs.x.ai/grok-bot/bots): named persistent teammates, skills and routines from demonstration, memory of preferences and summaries. Explicitly: memory is not an authoritative source; changing facts stay in the source system. There is no knowledge graph. [Vellum's breakdown](https://www.vellum.ai/blog/official-grok-bot-breakdown) notes you cannot inspect, correct, export or delete individual memories. Bots share one VM (files, cookies, logins). That is the opposite of Edge's project isolation and CONTROL law.

### Mem0 — graph retreated from OSS

Mem0 OSS used to mirror facts into Neo4j/Memgraph/Kuzu/AGE/Neptune. In OSS v3 that entire path (~4,000 lines) was **removed**. Graph memory is now a Mem0 Platform feature. OSS keeps entity linking inside the vector store to boost ranking, not a traversable graph ([migration](https://docs.mem0.ai/migration/oss-v2-to-v3)). Lesson: even a memory-layer company decided a real graph DB was too much operational load for self-host.

### Cognee — graph without a graph server

[Cognee](https://www.cognee.ai/best-ai-memory-layers-for-ai-agents-in-2026-comparison) is graph-first but defaults to **graph + vector on one Postgres** (pgvector). Neo4j/Kuzu/Qdrant are swappable. Write path ("cognify") builds a typed ontology — heavier than Mem0, lighter ops than Graphiti+Neo4j ([dreaming.press](https://dreaming.press/posts/cognee-vs-graphiti-vs-mem0-agent-memory.html)). Best analogue if Edge later wants graph-shaped Knowledge without a second database process. Compliance posture is weaker than Zep (no SOC2/HIPAA advertised as of mid-2026).

### CrewAI — LanceDB + LLM analysis, no graph

[CrewAI Memory](https://docs.crewai.com/edge/en/concepts/memory): one `Memory` class, LLM infers scope/categories/importance on save, composite recall (semantic + recency + importance), hierarchical scopes like a filesystem. Default store LanceDB. Shared across a crew. No graph, no temporal invalidation.

### LangGraph / LangMem — KV + vectors, two clocks

[LangGraph stores](https://docs.langchain.com/oss/python/langgraph/stores): checkpointer = short-term thread state; `BaseStore` = cross-thread JSON documents in namespaces, optional vector search. Production: Postgres. [LangMem](https://langchain-ai.github.io/langmem/) adds hot-path tools and a background extractor. No graph. The checkpointer/store split is the same idea as Edge's Run timeline vs Knowledge/memory.

### OpenClaw — pluggable, not native

[Issue 2910](https://github.com/openclaw/openclaw/issues/2910) asked for a `MemoryGraph` interface with Cognee/Zep/Mem0 adapters. Community plugins exist; maintainers warn MCP-as-memory is inefficient. [Community comparison](https://clawdocs.org/guides/memory-systems) lists a zoo of plugins. One custom stack ([openclaw-memory-architecture](https://github.com/coolmanns/openclaw-memory-architecture)) puts a 3k-fact graph in SQLite with `superseded_at` decay — Graphiti's invalidation idea without Graphiti.

---

## 4. Other aspects that matter more than the graph

These recur across the survey and map onto Edge v6.0.

**Canonical vs derived.** Graphiti keeps episodes as canonical and treats entities/edges as extracted. Cognee and Mem0 often collapse that. Edge already requires this split for Knowledge (§101). A graph, if added, MUST be a derived index of canonical sources (Runs, Knowledge, Skills, memory entries), rebuildable.

**Write-time LLM.** Graphiti and Cognee spend tokens on every ingest. Mem0 is cheaper (single-pass facts). Hermes writes markdown with optional approval. On a `lite` profile or `local_only` project, Graphiti-style extraction either leaves the machine or fails on a small local model. Extraction is itself `model.infer.*`.

**Temporal invalidation vs overwrite.** Vector stores delete or bury stale chunks. Graphiti expires edges. Hermes memory files just get edited. For a company ("the vendor is X" then "the vendor is Y"), invalidation is the actual value of a graph. SQLite can do it with `valid_at`/`invalid_at` on an `entity_edges` table; you do not need Neo4j for that.

**Multi-hop vs keyword.** Graphs win when the query is a path. Most assistant queries are not ("what did we decide about the Q3 hire?"). FTS5 + embeddings cover that. Do not pay graph-ops cost until multi-hop shows up in real Runs.

**Inspect and correct.** Grok Bot fails this. Letta blocks, Hermes files, and Edge §109 require user-visible, editable memory. A graph that users cannot see or correct will rot into false CONTROL.

**Isolation.** Graphiti `group_id`, LangGraph namespaces, CrewAI scopes, Hermes profiles. Edge projects are the namespace. One org-wide graph would leak Project A into Project B.

**Memory is not authority.** Only Grok Bot's docs even approach this ("memory is not a substitute for an authoritative source"). Nobody else has CONTROL vs DATA. Extracted "email Alice" from a graph is still untrusted. This is Edge's differentiator; a graph must not punch through it.

**Operational surface.** Mem0 OSS dropped Neo4j. Graphiti's embedded path is immature (Kuzu dead, FalkorDB Lite single-process). Cognee's "one Postgres" and Temporal's "SQLite WAL" are the only graph-shaped designs that fit a Mac mini / Pi appliance. Edge V1 already committed to SQLite as the single writer.

**Skills vs facts.** Hermes and Grok Bot invest in procedures (skills/routines), not entity graphs. That matches Edge Part X. A skill graph (SQLite adjacency of skills) is cheaper and more useful on day one than a world graph.

---

## 5. Decision (v6.1)

Use Graphiti in V1, under these constraints (now in SPEC.md Part X):

1. Derived index only. Canonical sources stay in SQLite. Rebuild on demand.
2. Backend: FalkorDB Lite, Control Plane as single writer. No Neptune, no Kuzu, no Zep Cloud. Neo4j is not default.
3. Extraction is a `GRAPH_INGEST` worker job through the model router. Graphiti MUST NOT construct with the OpenAI default client.
4. Retrieved nodes and edges are DATA. Safety tests 41–50.
5. `group_id` = `project_id`. Users inspect, correct, delete.
6. FTS5 remains the fallback when the graph is down or `lite` cannot extract.

Do not use Graphiti as policy, grant, effect, or Barrier input.

Sources used for this note are listed in the accompanying research reply.
