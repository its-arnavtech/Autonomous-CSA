# Todo

## Immediate Fixes

1. Run the full Phase 0 verification flow after every fresh checkout.
2. Add `.env.example` files documenting `REDIS_HOST`, `REDIS_PORT`, `PORT`, and `API_BASE_URL`.
3. Add app-level `typecheck` scripts or remove/fix the root `typecheck` script.
4. Add DTO validation for `POST /tickets` fields: `orgId`, `subject`, `body`, and `customerEmail`.
5. Return proper HTTP 400 errors when `orgId` is missing from `GET /tickets/:id/timeline`.
6. Add tests for ticket creation, timeline retrieval, and worker timeline writes.
7. Replace app starter READMEs with project-specific API, worker, and web notes.

## Week 2 Core Product

1. Design PostgreSQL schema for tenants, users, tickets, ticket messages, customers, and agent events.
2. Add migrations and local Postgres to Docker Compose.
3. Persist tickets on `POST /tickets`.
4. Persist worker timeline events to PostgreSQL instead of Redis lists.
5. Add ticket status lifecycle: `NEW`, `QUEUED`, `PROCESSING`, `NEEDS_HUMAN`, `RESOLVED`, `FAILED`.
6. Add API endpoints to list tickets and read a ticket detail record.
7. Build a basic web ticket list and ticket detail view.
8. Add structured logging and correlation ids across API, queue job, worker, and timeline events.

## Week 3 RAG

1. Add knowledge base document model and ingestion API.
2. Add pgvector extension and embedding storage.
3. Add document chunking pipeline in the worker.
4. Add retrieval endpoint or service used by worker jobs.
5. Record retrieval events in the audit timeline.
6. Add source citations to draft responses.
7. Add tests for ingestion, retrieval, and tenant isolation.

## Week 4 Agentic AI

1. Define the agent run state machine and event taxonomy.
2. Add OpenAI client configuration and secret handling.
3. Implement ticket classification and priority estimation.
4. Implement routing decision logic beyond the current stub.
5. Implement draft response generation using ticket context and retrieved sources.
6. Add safety checks for hallucination risk, policy violations, and low confidence.
7. Add human approval queue and approval/reject endpoints.
8. Persist model inputs/outputs or safe audit summaries according to retention policy.

## Week 5 Production and Deployment

1. Add Dockerfiles for `apps/web`, `apps/api`, and `apps/worker`.
2. Expand `docker-compose.yml` for local Postgres, Redis, API, worker, and web.
3. Add CI for install, lint, typecheck, tests, build, and Docker image build.
4. Add database migration checks to CI.
5. Add deployment manifests for Fly.io or the chosen platform.
6. Add health/readiness endpoints for API and worker.
7. Add Redis and Postgres connection retry/backoff handling.
8. Add metrics for queue depth, job duration, failures, and API latency.
9. Add error tracking and structured logs.
10. Add production secrets documentation and deployment runbook.
