# Engineering Tradeoffs

This repository is intentionally in a prototype foundation phase. The tradeoffs below describe what the current code does and why it is acceptable only as a stepping stone.

## Redis Timeline Is Temporary

Current timeline events are written to Redis lists at `timeline:{orgId}:{ticketId}`. This is fast and convenient while proving the async worker loop, but Redis is not the right long-term audit system for AI decisions.

Tradeoff:

- Good for rapid local iteration.
- Poor durability and queryability.
- No relational links to tickets, users, tenants, messages, or approvals.
- No migration story or compliance posture.

Planned direction: persist timeline/audit events in PostgreSQL, likely in an `agent_events` table, while Redis remains the queue backend.

## PostgreSQL `agent_events` Planned

The product goal requires an auditable AI timeline. That should be modeled as durable event records with tenant id, ticket id, run id, event type, payload, timestamps, and actor/source metadata.

Tradeoff:

- Delaying the schema keeps the prototype small.
- The longer Redis remains the source of truth, the more code will need to be unwound.

## REST and Polling First

The current interface is REST-first: `POST /tickets` creates/enqueues work, and `GET /tickets/:id/timeline` reads the timeline.

Tradeoff:

- Simple to inspect, test, and document.
- Easy to proxy through Next.js.
- Less real-time than WebSockets/SSE.

Planned direction: keep REST as the baseline API and add polling, SSE, or WebSockets only after the lifecycle and event model are stable.

## Queue-Based Async Worker

Ticket processing is asynchronous through BullMQ and Redis. This is a good fit for AI workflows because routing, retrieval, tool calls, and drafting can be slow or retryable.

Tradeoff:

- Adds operational dependency on Redis.
- Requires idempotency, retries, dead-letter handling, and observability before production.
- Keeps API request latency low and separates user-facing HTTP from background work.

## Next Proxy Route

The web app uses a Next.js route handler to proxy timeline requests to the API instead of coupling browser code directly to the API host.

Tradeoff:

- Centralizes API base URL handling on the server side.
- Avoids browser CORS concerns during local development.
- Creates an extra hop and requires careful route param naming.

Phase 0 note: the proxy route now uses the `[ticketId]` folder name and matching `params.ticketId` value.

## Hardcoded `orgId` Is Temporary

The web layer defaults missing `orgId` to `org_demo`, and `POST /tickets` accepts `orgId` from the request body.

Tradeoff:

- Useful for proving tenant-scoped keys before auth exists.
- Not secure.
- Not production multi-tenancy.

Planned direction: derive tenant context from authenticated user/session/JWT claims and enforce it in API middleware/guards and database queries.

## Stubbed Router Decision

The worker writes a hardcoded `ROUTER_DECISION` event with `DRAFT_FOR_HUMAN`, confidence `0.62`, and reason `stubbed`.

Tradeoff:

- Provides a visible timeline event contract before real agents exist.
- Does not classify, retrieve, reason, draft, or take action.

Planned direction: replace the stub with a real agent pipeline that performs classification, policy checks, retrieval, drafting, and human approval routing.

## Swagger Before Full Schemas

Swagger is mounted at `/docs`, but the API does not yet define rich DTO classes or decorators for request/response schemas.

Tradeoff:

- Gives an API docs surface early.
- Documentation quality is limited until DTOs are modeled.

Planned direction: add DTO validation and OpenAPI annotations together so runtime behavior and docs stay aligned.
