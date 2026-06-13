# Engineering Tradeoffs

## PostgreSQL Is Source Of Truth

Tickets, ticket messages, agent runs, and agent timeline events now live in PostgreSQL through Prisma. This is a major improvement over the Phase 0 Redis timeline because timeline data is durable, queryable, relational, and migration-backed.

Tradeoff:

- Better auditability and product correctness.
- More local setup complexity because Postgres and migrations are required.
- More operational work remains before production, including backup, migration, and connection-pool strategy.

## Redis Is Queue-Only

Redis remains the BullMQ backend. It no longer stores the ticket timeline.

Tradeoff:

- Cleaner responsibility boundary.
- Redis loss no longer deletes ticket/audit history.
- Queue durability/retry/dead-letter behavior still needs production hardening.

## `orgId` Means Org Slug For Now

The API continues accepting `orgId: "org_demo"` to preserve the Phase 0 request contract. In Phase 1, that value is resolved as `Organization.slug`, then the database `Organization.id` is used internally.

Tradeoff:

- Keeps local and web compatibility simple.
- Avoids exposing database ids in the basic request shape.
- Not secure. A real auth and tenant context must replace this before production.

## Shared Prisma Package

Prisma schema, migration, seed, and client exports live in `packages/db`. API and worker consume the shared database package, while each app owns its own simple Nest `PrismaService`.

Tradeoff:

- One schema and migration source for both API and worker.
- The package must be built before API/worker runtime imports, so Turbo `dev` depends on workspace dependency builds.
- Prisma Client generation is still required before first use.

## REST And Polling First

The product still uses REST endpoints and server-side Next fetches. No WebSockets or SSE are implemented yet.

Tradeoff:

- Simple to validate and debug.
- Good enough for early ticket/timeline pages.
- Real-time updates will need polling, SSE, or WebSockets later.

## Stubbed Agent Decision

The worker still writes a hardcoded `ROUTER_DECISION` payload.

Tradeoff:

- Keeps Phase 1 focused on persistence and async orchestration.
- Provides a stable event shape for the UI.
- No actual OpenAI, RAG, policy checks, or tool calls are implemented yet.

## Minimal UI

The web app has a timeline page and a small ticket inbox. It does not include ticket creation, auth, assignment, filtering, or approval UI.

Tradeoff:

- Enough UI to verify database-backed flows.
- Avoids frontend expansion before core domain behavior stabilizes.

