# Interview Guide

## Why TypeScript Instead Of Python?

The product is primarily orchestration, APIs, queues, persistence, validation, and web UI. TypeScript provides one strongly typed language across those boundaries and mature SDK support for OpenAI and Anthropic. Agentic behavior comes from planning stages, tool use, state, critique, guardrails, and asynchronous control flow, not from the implementation language. Python would be justified for a separate model-training or data-science workload; v1.0 has neither.

## Why Is It Agentic?

It does more than call an LLM. A durable run selects a route, retrieves tenant knowledge, resolves a proposed response/action, critiques it, applies safety and policy, requests human approval, and can resume through queue and provider failures. Each stage and decision is persisted and inspectable.

## Router / Retriever / Resolver / Critic

- **Router:** classifies intent, priority, risk, and next action.
- **Retriever:** searches organization-scoped knowledge and records sources/scores.
- **Resolver:** produces a grounded response proposal and action metadata.
- **Critic:** challenges grounding, completeness, policy, and confidence before guardrails/approval.

## PostgreSQL As Source Of Truth

Tickets, runs, steps, approvals, idempotency receipts, dispatch leases, outbound messages, attempts, failures, and audit history must survive queue loss and restarts. PostgreSQL transactions and constraints provide that durability. Redis can be flushed and work can be reconstructed from database state.

## BullMQ As Delivery Infrastructure

BullMQ supplies delayed jobs, bounded attempts, backoff, stalled-job handling, queue events, and concurrency. Jobs carry IDs and correlation context, not secrets or large customer payloads. Reconcilers bridge committed database state back into queues after Redis outages.

## Transactional Outbox

Approval and the unique outbound message are created in one database transaction. The worker atomically claims an eligible record, records attempts, and advances state. A reconciler enqueues pending/retry/stale rows. This avoids the classic database-commit/queue-publish gap without pretending Redis and PostgreSQL share a transaction.

## Webhook Idempotency

The public connection ID selects a configured tenant; raw bytes are HMAC-verified before processing. A database-unique provider event receipt wins concurrent races. Additional unique message/thread keys prevent duplicate conversations, tickets, and messages. Payloads cannot inject organization or ticket identity.

## Tenant Isolation

JWT identity plus membership lookup produces the tenant context. A forwarded organization header is only a membership selector. Guards enforce roles; services include the verified organization in queries; jobs reload records and compare organization IDs; end-to-end tests forge organizations and confirm rejection.

## Guardrails And Approval

The worker checks secrets, PII, grounding, policy, confidence, and bounded cost. Organization settings decide auto-draft versus human review. Drafts in blocked/rejected states cannot send, and human actions record user attribution.

## Retries, Dead-Letter, And Replay

Errors are classified transient or permanent. Transient delivery failures retry with a cap and delay; permanent ones dead-letter immediately. Failures are visible in operations. Replay requires a privileged role and creates a new controlled attempt without erasing history.

## Backup And Restore

Scripts require PostgreSQL client/server compatibility, create a custom-format dump, compute SHA-256, write redacted metadata, and restore into a separate verification database. The final drill compared migration/user counts and a larger channel dataset before and after restore.

## Local Production-Like Staging

Docker Compose builds non-root production images and runs a one-shot migration, PostgreSQL 18, persistent Redis, API, worker, and web. Generated credentials stay ignored. The verifier covers readiness, RBAC, migrations, seed, queue compatibility, channel E2E, load, restart/outage drills, backup, and restore.

## Zero-Spend Tradeoff

Hosted Fly foundations exist, but a persistent environment required billing and would not improve the core engineering evidence enough to violate the zero-spend constraint. The project states the limitation plainly, keeps deployment opt-in, and invests in reproducible local/CI proof instead.
