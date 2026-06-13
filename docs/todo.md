# Todo

## Immediate Fixes

1. Add DTO validation for `POST /tickets` using a consistent validation strategy.
2. Add tests for API ticket create/list/detail/timeline flows.
3. Add worker tests for `ticket.process` success and failure paths.
4. Add idempotency guards for worker event writes on retry.
5. Add proper pagination to `GET /tickets`.
6. Replace starter app READMEs with project-specific API, worker, web, and db notes.
7. Decide whether to keep Prisma seed config in `package.json` or move to Prisma config before Prisma 7.

## Week 2 Core Product

1. Add ticket creation UI.
2. Add ticket status transitions for processing, pending human, resolved, escalated, and failed states.
3. Add customer model or normalize repeated customer fields.
4. Add structured logging and correlation ids across API, queue job, worker, and agent events.
5. Add failure/retry visibility for agent runs.
6. Add basic filters for inbox status and priority.
7. Add API response DTOs and Swagger decorators.

## Week 3 RAG

1. Add knowledge base document model and ingestion API.
2. Add pgvector extension and embedding storage.
3. Add document chunking pipeline in the worker.
4. Add retrieval service used by worker jobs.
5. Record retrieval events in `AgentEvent`.
6. Add source citations to draft responses.
7. Add tests for ingestion, retrieval, and tenant isolation.

## Week 4 Agentic AI

1. Define agent run state machine and event taxonomy beyond the current stub.
2. Add OpenAI client configuration and secret handling.
3. Implement ticket classification and priority estimation.
4. Replace stubbed router decision logic.
5. Generate draft responses using ticket context and retrieved sources.
6. Add safety checks for hallucination risk, policy violations, and low confidence.
7. Add human approval queue and approval/reject endpoints.
8. Persist model inputs/outputs or safe audit summaries according to retention policy.

## Week 5 Production And Deployment

1. Add Dockerfiles for `apps/web`, `apps/api`, and `apps/worker`.
2. Expand local compose to optionally run web/API/worker services.
3. Add CI for install, lint, typecheck, tests, build, Prisma generate, and migration checks.
4. Add deployment manifests for the chosen platform.
5. Add health/readiness endpoints for API and worker.
6. Add Redis and Postgres connection retry/backoff handling.
7. Add metrics for queue depth, job duration, failures, and API latency.
8. Add error tracking and structured logs.
9. Add production secrets documentation.
10. Add backup and migration runbook.

