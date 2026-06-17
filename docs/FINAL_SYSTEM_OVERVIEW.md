# Final System Overview

## Purpose And User

Autonomous CSA is a feature-complete portfolio-grade MVP for support teams that want auditable AI assistance without surrendering tenant isolation or human control. Operators manage tickets, knowledge, drafts, channels, approvals, and failures from one console; administrators manage organization settings and operational review.

## Primary Workflows

1. An operator creates a ticket, or a signed provider webhook creates it from an external conversation.
2. The API persists the ticket, message, run, and timeline state before queueing identifiers.
3. The worker executes Router, Retriever, Resolver, and Critic stages, recording each step.
4. Knowledge citations, confidence, cost estimates, PII/secret checks, policy checks, and organization settings determine whether the result is blocked, escalated, or sent to human approval.
5. An authorized user reviews the draft. Approval creates a transactional outbound record; the delivery worker sends through the configured provider and records attempts/callbacks.
6. Operators use the operations dashboard to inspect runs, audit records, retries, dead letters, and replay controls.

## Components And Data Flow

- **Web:** Next.js App Router pages and same-origin route handlers. Tokens stay in HttpOnly cookies; the BFF forwards a verified tenant selection to the API.
- **API:** NestJS authentication, tenancy, RBAC, ticket/knowledge/approval/channel APIs, webhook ingress, outbox creation, operations views, metrics, and health.
- **Worker:** BullMQ ticket processing, agent stages, LLM abstraction, guardrails, delivery, reconciliation, and graceful shutdown.
- **PostgreSQL 18:** source of truth for users, memberships, sessions, tickets, runs, steps, messages, knowledge, approvals, receipts, dispatches, delivery attempts, audit, and failures.
- **Redis/BullMQ:** non-authoritative asynchronous delivery and distributed rate-limiting substrate.

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation-matched diagrams.

## Why It Is Agentic

Agentic behavior is an architectural property, not a Python dependency. This TypeScript system selects actions through a multi-stage Router/Retriever/Resolver/Critic pipeline, invokes knowledge and provider tools, persists intermediate execution state, evaluates its own proposed answer, applies guardrails and policy, requests human approval, and resumes asynchronously. Deterministic fallback makes that orchestration reproducible without pretending to train or fine-tune a foundation model.

## Security Model

Access JWTs are short-lived; refresh tokens rotate and are stored only as hashes. The BFF uses HttpOnly cookies with runtime-enforced secure settings outside the explicit local staging profile. API guards verify the user, active membership, organization, and role before services perform organization-scoped queries. Webhooks use raw-byte HMAC verification, timing-safe comparison, connection-derived tenancy, replay receipts, and payload bounds. Logs redact secrets, connection URLs, tokens, cookies, and customer bodies.

## Reliability Model

Database writes precede queue delivery, while inbound dispatch and outbound reconciliation recover Redis interruptions. Job retries and delivery retries are bounded and classified. Stale processing leases recover, permanent failures dead-letter, and replay is role-controlled. Readiness includes dependencies and shutdown state. Backups are checksummed and restore-tested with PostgreSQL 18 clients.

## Support Channel Model

v1.0 ships a zero-spend mock email adapter that exercises the same provider interface, signed ingress, threading, customer matching, approval/outbox, attempt, callback, and replay contracts intended for future external adapters. It does not claim real email delivery.

## Deployment Model

The validated environment is local production-like Docker Compose: production web/API/worker images, a one-shot migration container, PostgreSQL 18, Redis 7, generated local secrets, deterministic AI, and mock channels. GitHub Actions repeat quality, migration, security, and image gates. Fly.io manifests are an opt-in future foundation; deployment is disabled by default.

## Current Limitations

There is no production deployment, persistent hosted staging, real customer data, production traffic, production SLA, external email delivery, model training, or fine-tuning. Real channel adapters, managed secrets/storage, SSO/invitations, billing, multi-region failover, and production-scale performance testing remain future work. Hosted staging is intentionally deferred because the project will not attach billing or provision paid infrastructure.
