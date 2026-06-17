# Portfolio Summary

## Problem

Customer-support automation is easy to demo as a prompt and difficult to operate as a trustworthy system. The hard problems are identity, tenant isolation, durable state, auditable decisions, safe webhook ingress, human control, idempotent delivery, and recovery when queues or providers fail.

## Solution

Autonomous CSA is a multi-tenant support platform that turns tickets or signed channel messages into persisted agent runs. A Router/Retriever/Resolver/Critic pipeline gathers knowledge, proposes a response, critiques it, applies guardrails, and requests approval. Approved drafts enter a transactional delivery workflow with bounded retries, callbacks, dead-letter state, and replay.

## Architecture

Next.js provides the operator UI and token-hiding BFF. NestJS API owns authentication, tenancy, synchronous business commands, webhooks, outbox creation, and operations views. A separate NestJS worker owns agent and delivery execution. PostgreSQL 18 is the source of truth; Redis/BullMQ is replaceable delivery infrastructure. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Hardest Engineering Problems

- Preventing caller-supplied organization IDs from becoming an authorization boundary.
- Achieving webhook and approval idempotency under concurrent duplicates.
- Recovering database-committed work when Redis, workers, APIs, or PostgreSQL restart.
- Avoiding duplicate external sends while preserving retry and replay visibility.
- Keeping logs useful without leaking tokens, URLs, provider secrets, or customer bodies.
- Making a production-like demo reproducible on Windows without paid infrastructure.

## Tradeoffs

- TypeScript across web, API, and workers reduces context switching and shares runtime contracts; it does not reduce agentic behavior.
- Application-layer scoping is thoroughly tested but database RLS would add defense in depth.
- Deterministic AI and a mock provider maximize reproducibility and zero-spend validation; they do not prove live provider behavior.
- PostgreSQL-backed recovery records add writes and schema complexity but prevent Redis from becoming business truth.
- Hosted staging was deliberately deferred rather than attaching billing to improve a portfolio claim.

## Measured Results

The June 17, 2026 local release run passed 212 automated tests, 13 PostgreSQL 18.4 migrations, all production images, Redis/BullMQ compatibility, backup/restore, channel E2E, and restart/outage drills. The final bounded 20-request, concurrency-5 mock-channel drill measured p50 75 ms, p95 329 ms, p99 364 ms, 0% request errors, and 9 duplicate suppressions. These are local engineering checks, not business impact or production capacity.

## Limitations

No production or persistent hosted deployment, real customer traffic, real external email delivery, model training, production SLA, or fabricated business impact is claimed. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
