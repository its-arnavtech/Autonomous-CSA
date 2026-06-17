# Final Security Audit

Audit date: June 17, 2026. Scope: authentication, authorization, tenant data access, channel ingress/egress, observability, runtime configuration, containers, dependencies, CI, and local production-like verification.

## Resolved

| Finding | Resolution and evidence |
| --- | --- |
| Repeated connection-string log sanitization relied on a stateful global regular expression test | `sanitizeForLog` now performs unconditional replacement; a repeated-call regression test passes. |
| Release metadata and runtime version were stale/inconsistent | Workspace package versions and local image metadata now report `1.0.0` / `1.0.0-local`. |
| Obsolete tracked screenshots and unused starter web assets | Removed; `public/.gitkeep` preserves the Docker build contract. |
| Stale current-status test counts and obsolete todo claims | Replaced with the final validation report and known-limitations document. |
| No single release demo command | `demo:up` and `demo:verify` compose the production-image, channel, backup/restore, load, and failure gates without printing generated secrets. |

No unresolved high or critical security vulnerability was found. `pnpm audit --audit-level low` reported no known vulnerabilities.

## Authentication Audit

- Passwords use Argon2id. Login and registration DTOs are globally validated with whitelist and unknown-field rejection.
- Access and refresh signing keys are separately validated; production-like placeholder secrets are rejected.
- Refresh sessions store token hashes, rotate transactionally, detect revoked/expired/reused sessions, and revoke on logout.
- Next.js stores access/refresh tokens in HttpOnly cookies. Secure/SameSite/domain rules are runtime-validated; insecure cookies require the explicit local-staging profile.
- Auth rate limiting uses Redis and fails closed; general API limiting is distributed and configured to fail open to preserve service availability.
- Accepted limitation: access JWTs remain valid until their short expiry after logout; logout revokes refresh, not already-issued access tokens.

## Authorization And Tenant Audit

- JWT verification establishes user identity; `TenantContextGuard` resolves the requested organization against an active membership.
- `RolesGuard` enforces OWNER/ADMIN/AGENT/VIEWER controls for settings, channel management, operations, approval, and replay actions.
- Services scope tenant-owned reads and writes with the verified organization ID; jobs carry IDs and reload authoritative data.
- Composite uniqueness and relation checks protect conversation, message, receipt, dispatch, approval, and delivery idempotency.
- The final regression rejected a forged organization and confirmed a VIEWER cannot manage channels.
- Accepted limitation: Prisma does not provide database row-level security; isolation is enforced in guards, service predicates, transactions, and tests.

## Webhook Security Audit

- Nest captures the exact raw request bytes before JSON parsing. The provider verifies versioned HMAC signatures with timing-safe comparison.
- Connection public ID resolves the enabled connection and organization. Payload fields cannot choose an organization or arbitrary ticket.
- Unknown/disabled connections, invalid signatures, malformed payloads, oversized provider payloads, and unsupported events fail safely.
- Unique receipts and external message constraints suppress sequential and concurrent replay. Durable inbound dispatch recovers a committed receipt when Redis is down.
- Subject/body lengths are bounded; HTML is sanitized to plain text; attachment names and metadata are bounded and sanitized. Attachment bytes are not accepted or stored.
- Final tests passed raw-signature mutation, duplicate delivery, forged-tenant, and filename-sanitization cases.

## Data And Operational Security

- Runtime logging recursively redacts credentials, authorization/cookie headers, JWT/provider keys, password/token hashes, database/Redis URLs, and customer bodies; correlation metadata remains usable.
- Provider keys enter through validated environment variables and are not placed in queue jobs or database audit payloads.
- Metrics can be disabled and require bearer authentication in production-like environments. Swagger defaults off there.
- CORS uses an explicit allowlist. Trust-proxy input is validated. Helmet enables deny framing, no-sniff, referrer restrictions, and production HSTS.
- Liveness exposes only shallow service metadata; readiness exposes dependency status/latency but no credentials.
- API, worker, and web images run as the unprivileged `node` user. Docker build contexts exclude secrets, outputs, logs, and VCS metadata.
- CI uses frozen lockfiles, scoped workflow permissions, PostgreSQL 18 and Redis services, Gitleaks, Semgrep, Trivy, dependency audit, and CodeQL. Fly deployment is manual and gated by a GitHub environment.

## Accepted Limitations

- No database row-level security; application-layer tenant enforcement remains a critical invariant.
- Local demo credentials are generated into an ignored file. Anyone with local workspace access can read them; they are disposable and never suitable for hosted use.
- The deterministic and mock providers validate contracts but do not prove external-provider security or availability.
- Health endpoints are public by design for orchestrators; they reveal bounded status/version metadata.
- Security action references use version tags rather than immutable commit SHAs. Dependabot maintains them, but SHA pinning would reduce upstream tag-mutation risk.

## Deferred

- Managed secret storage and rotation, WAF/edge rate limiting, external penetration testing, SSO, SCIM, formal threat modeling, database RLS, and production incident response exercises.
- Malware scanning and object storage for attachment bytes; v1.0 stores sanitized attachment metadata only.
- Hosted staging and production security validation, deferred under the zero-spend policy.

## Not Applicable

- Foundation-model training/fine-tuning and training-data governance: the project orchestrates existing providers and trains no model.
- Payment-card compliance and billing controls: no billing or payment processing exists.
- Real customer data breach review: the repository and demo use synthetic data only; no real customer data was found.
