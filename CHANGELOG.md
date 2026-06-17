# Changelog

All notable changes to Autonomous CSA are documented here.

## [1.0.0] - 2026-06-17

### Added

- Multi-tenant authentication, rotating refresh sessions, RBAC, and tenant-aware web/API flows.
- Ticket, knowledge, Router/Retriever/Resolver/Critic, guardrail, approval, draft, and persistent agent-run workflows.
- Signed support-channel ingress, receipt idempotency, conversation/customer matching, transactional outbound delivery, retries, callbacks, dead-letter, and replay.
- Operations dashboard, audit export, structured logging, correlation, metrics, readiness, distributed rate limiting, backup/restore, retention, and runbooks.
- Production Docker images, PostgreSQL 18 local staging, Redis/BullMQ verification, CI/security workflows, Fly.io deployment foundation, and one-command local demo.

### Security

- Added raw-body HMAC verification, bounded channel content, secret/body redaction, production runtime validation, authenticated metrics, non-root containers, and supply-chain scanning.
- Fixed repeated connection-string sanitization so global regular-expression state cannot skip a later log value.

### Release Notes

- Feature-complete portfolio-grade MVP and locally production-validated.
- Hosted staging and production deployment are not claimed; hosted staging remains deferred under the zero-spend policy.
