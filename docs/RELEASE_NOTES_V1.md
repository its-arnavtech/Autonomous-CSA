# Autonomous CSA v1.0.0 Release Notes

v1.0.0 completes the portfolio MVP: a multi-tenant agentic support platform with durable orchestration, human control, secure channel ingress, and reliable asynchronous delivery.

## Highlights

- Router/Retriever/Resolver/Critic pipeline with persistent runs, steps, retrievals, guardrails, drafts, and approvals.
- First-party auth, refresh rotation, HttpOnly BFF cookies, membership-derived tenancy, and four-role RBAC.
- Signed inbound webhooks, replay suppression, durable dispatch recovery, threading, customer matching, sanitized attachment metadata, and audit events.
- Transactional outbound records, atomic claims, attempt history, classified bounded retries, callbacks, dead-letter, reconciliation, and authorized replay.
- Health/readiness, structured redacted logs, correlation IDs, metrics, distributed rate limiting, backup/restore, local load, and restart/outage drills.

## Validation

The final local run passed 212 tests, 13 fresh/idempotent migrations on PostgreSQL 18.4, Redis/BullMQ compatibility, API/worker/web production image builds, backup/checksum/restore, channel E2E, and failure recovery. The final bounded local channel test completed 20 requests at concurrency 5 with p50 75 ms, p95 329 ms, p99 364 ms, and 0% request errors.

These figures describe one reproducible local verification run; they do not represent real customer traffic, production capacity, or an SLA.

## Deployment Decision

Fly.io manifests and a manually gated workflow remain as future deployment groundwork. No billing will be attached, paid resources will not be provisioned, and hosted staging is deferred under the zero-spend policy. Production deployment is not claimed.

## Limitations And Future Work

Real external channel adapters, hosted secrets/observability, attachment object storage and scanning, SSO/invitations, database RLS, multi-region resilience, production load testing, and a hosted staging security review remain future work. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
