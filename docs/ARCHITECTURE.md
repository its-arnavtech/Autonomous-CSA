# Architecture

Autonomous CSA is a TypeScript monorepo with a Next.js operator console, a NestJS control-plane API, a NestJS asynchronous worker, PostgreSQL as the system of record, and Redis/BullMQ as bounded delivery infrastructure.

## High-Level System

```mermaid
flowchart LR
  User["Support operator"] --> Web["Next.js web / BFF"]
  Channel["Mock or future channel adapter"] --> Hook["Raw signed webhook"]
  Web --> API["NestJS API"]
  Hook --> API
  API --> PG[("PostgreSQL 18")]
  API --> Q["BullMQ queues"]
  Q --> Redis[("Redis 7")]
  Q --> Worker["NestJS worker"]
  Worker --> PG
  Worker --> AI["Deterministic / OpenAI / Anthropic"]
  Worker --> Channel
  API --> Obs["Logs / metrics / health"]
  Worker --> Obs
```

PostgreSQL owns business truth, idempotency records, queue-recovery state, and audit history. Redis is not authoritative application storage.

## Ticket And Agent Processing

```mermaid
sequenceDiagram
  participant U as Operator or channel
  participant A as API
  participant D as PostgreSQL
  participant Q as BullMQ
  participant W as Worker
  U->>A: Create or ingest ticket
  A->>D: Persist ticket, message, run, queued event
  A->>Q: Enqueue IDs and correlation metadata
  Q->>W: ticket.process
  W->>D: Claim run and write Router step
  W->>D: Retrieve tenant knowledge and write Retriever step
  W->>D: Write Resolver draft proposal
  W->>D: Write Critic result and guardrail checks
  W->>D: Persist draft and approval or escalation state
  A-->>U: Tenant-scoped timeline and review controls
```

The queue payload contains identifiers, not provider secrets or customer message bodies. The worker reloads authoritative records under the job's organization ID.

## Inbound Support Channel

```mermaid
sequenceDiagram
  participant P as Provider
  participant A as API webhook
  participant D as PostgreSQL
  participant Q as BullMQ
  participant W as Worker
  P->>A: Raw bytes + connection public ID + HMAC
  A->>D: Resolve enabled connection and organization
  A->>A: Timing-safe signature and payload-limit checks
  A->>D: Insert unique WebhookReceipt
  A->>D: Match customer/conversation; persist message and dispatch
  A->>Q: Enqueue ticket ID, run ID, organization ID
  A-->>P: Accepted or duplicate-safe response
  Q->>W: Process agent run
  W->>D: Draft, guardrails, approval
```

Unknown or disabled connections fail before business writes. The payload cannot select an organization or ticket. A durable inbound-dispatch reconciler recovers an accepted database transaction if Redis is temporarily unavailable.

## Outbound Transactional Delivery

```mermaid
sequenceDiagram
  participant O as Authorized operator
  participant A as API
  participant D as PostgreSQL
  participant Q as BullMQ
  participant W as Delivery worker
  participant P as Provider
  O->>A: Approve and send draft
  A->>D: Transactionally create one OutboundMessage
  A->>Q: Enqueue outbound message ID
  Q->>W: channel.delivery
  W->>D: Atomically claim eligible row and record attempt
  W->>P: Send using connection adapter
  P-->>W: Provider message ID or classified error
  W->>D: SENT, RETRY_SCHEDULED, or DEAD_LETTER
  P->>A: Signed delivery callback
  A->>D: Idempotently advance delivery state
```

Successful sends are not retried. Transient failures have bounded exponential backoff; permanent failures dead-letter immediately. Reconciliation recovers pending, retryable, or stale-processing rows.

## Authentication And Tenant Context

```mermaid
sequenceDiagram
  participant B as Browser
  participant W as Next.js BFF
  participant A as NestJS API
  participant D as PostgreSQL
  B->>W: Login credentials
  W->>A: POST /auth/login
  A->>D: Verify Argon2id hash; create hashed refresh session
  A-->>W: Access token, refresh token, memberships
  W-->>B: HttpOnly cookies
  B->>W: Tenant-scoped request
  W->>A: Bearer token + selected organization header
  A->>D: Verify active user and membership
  A->>A: TenantContextGuard and RolesGuard
  A->>D: Query with verified organization ID
```

The organization header selects among memberships; it is never trusted by itself. Refresh tokens rotate, old sessions are revoked, and logout revokes the presented session.

## Local Production-Like Topology

```mermaid
flowchart TB
  Host["Windows / Linux host"] --> Web["web container :3100"]
  Host --> API["api container :3101"]
  Host --> WorkerHealth["worker health :3102"]
  Host --> PG["PostgreSQL 18 :55432"]
  Host --> Redis["Redis 7 :6380"]
  Migration["one-shot migration container"] --> PG
  Web --> API
  API --> PG
  API --> Redis
  Worker["worker container"] --> PG
  Worker --> Redis
  Vol1[("Postgres volume")] --- PG
  Vol2[("Redis volume")] --- Redis
```

The demo generates local secrets into ignored `run-output/staging-local.env`, builds the same non-root production images used by CI, runs migrations before applications, and uses the deterministic AI and mock channel providers. Hosted Fly manifests exist only as a future opt-in foundation.

## Ownership And Failure Model

- API controllers validate transport input and delegate to tenant-aware services.
- Composite uniqueness, organization-scoped lookups, guards, and service predicates enforce isolation.
- Database transactions couple approval/outbox state and inbound receipt/message state.
- BullMQ provides delivery, delay, retry, stalled-job detection, and bounded retention.
- Readiness checks PostgreSQL, Redis, configuration, and shutdown state; liveness intentionally remains shallow.
- Correlation IDs connect HTTP, job, run, step, audit, and failure records.
- Backup tooling requires compatible PostgreSQL clients, checksum verification, redacted metadata, and restore into an isolated database.
