# Architecture

This monorepo is a Phase 1 foundation for an Agentic AI Customer Support SaaS. The current system uses Next.js, NestJS API, NestJS worker, BullMQ, Redis, PostgreSQL, and Prisma. Redis is now queue infrastructure only. PostgreSQL is the source of truth for tickets, ticket messages, agent runs, and agent timeline events.

Auth, enforced multi-tenancy, OpenAI agents, RAG, pgvector embeddings, deployment, and CI/CD are still future phases.

## Current Applications

| Path | Role | Current status |
| --- | --- | --- |
| `apps/web` | Next.js App Router UI | Ticket timeline page, minimal ticket inbox page, and Next proxy routes for tickets/timeline. |
| `apps/api` | NestJS REST API | Health, ticket create/list/detail, timeline endpoint, Swagger, BullMQ enqueue, Prisma persistence. |
| `apps/worker` | NestJS worker | Consumes BullMQ `ticket.process`, updates `AgentRun`, and writes `AgentEvent` rows. |
| `packages/db` | Shared database package | Prisma schema, migration, seed, generated-client export surface. |
| `packages/config` | Future shared config package | Placeholder. |
| `packages/shared` | Future shared domain/types package | Placeholder. |
| `infra` | Future infrastructure definitions | Placeholder. |

## Service Architecture

```mermaid
flowchart LR
  Browser["Browser"] --> Web["apps/web Next.js"]
  Web --> TicketProxy["Next route: /api/tickets"]
  Web --> TimelineProxy["Next route: /api/tickets/[ticketId]/timeline"]
  TicketProxy --> Api["apps/api NestJS API"]
  TimelineProxy --> Api
  Api --> Postgres["PostgreSQL"]
  Api --> Queue["BullMQ queue: support"]
  Queue --> Redis["Redis queue backend"]
  Worker["apps/worker NestJS worker"] --> Queue
  Worker --> Postgres

  Agents["OpenAI agent pipeline planned"] -. future .- Worker
  Pgvector["pgvector/RAG planned"] -. future .- Postgres
```

## Ticket Processing Sequence

```mermaid
sequenceDiagram
  participant Client as API client
  participant API as NestJS API
  participant DB as PostgreSQL
  participant Queue as BullMQ support queue
  participant Redis as Redis
  participant Worker as NestJS worker

  Client->>API: POST /tickets orgId=org_demo
  API->>DB: Resolve Organization by slug
  API->>DB: Create Ticket and inbound TicketMessage
  API->>DB: Create AgentRun QUEUED
  API->>DB: Create AgentEvent RUN_QUEUED sequence 1
  API->>Queue: Add ticket.process job
  Queue->>Redis: Persist queued job
  API-->>Client: { ticketId, enqueuedJobId }
  Worker->>Queue: Consume ticket.process
  Worker->>DB: Update AgentRun RUNNING
  Worker->>DB: Create RUN_STARTED sequence 2
  Worker->>DB: Create ROUTER_DECISION sequence 3
  Worker->>DB: Create RUN_FINISHED sequence 4
  Worker->>DB: Update AgentRun SUCCEEDED
```

## Timeline Flow

```mermaid
sequenceDiagram
  participant User as Browser/User
  participant WebPage as Next ticket page
  participant Proxy as Next timeline proxy
  participant API as NestJS API
  participant DB as PostgreSQL

  User->>WebPage: GET /tickets/:ticketId?orgId=org_demo
  WebPage->>Proxy: GET /api/tickets/:ticketId/timeline?orgId=org_demo
  Proxy->>API: GET /tickets/:ticketId/timeline?orgId=org_demo
  API->>DB: Query AgentEvent ordered by sequence
  DB-->>API: AgentEvent rows
  API-->>Proxy: [{ ts, type, payload }]
  Proxy-->>WebPage: JSON timeline
  WebPage-->>User: Render Agent Timeline
```

## Database

Prisma lives in `packages/db`.

Implemented models:

- `Organization`
- `Ticket`
- `TicketMessage`
- `AgentRun`
- `AgentEvent`

Implemented enums:

- `TicketStatus`
- `TicketPriority`
- `MessageDirection`
- `AgentRunStatus`
- `AgentRunTrigger`
- `AgentEventType`

The first migration is in `packages/db/prisma/migrations/20260613201721_init`.

## Temporary Tenant Handling

The API still accepts `orgId: "org_demo"` for compatibility with Phase 0 requests. In Phase 1, that request value is treated as an organization slug, not the database primary key. The API resolves `Organization.slug = "org_demo"` and then uses the real `Organization.id` internally for tickets, messages, runs, and events.

This is not production multi-tenancy. Auth and tenant enforcement remain future work.

