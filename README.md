# Autonomous-CSA
A web app where a “company” can connect an inbox (start with a built-in inbox, add Gmail/Zendesk later), and the AI agent will classify and prioritize tickets then pull necessary data(docs, past tickets) then decide whether to answer or ask clarifying questions or escalate draft a response 

- Set up monorepo web/api/worker architecture
- Implemented async ticket processing via BullMQ + Redis
- Added worker-based ticket processor (ticket.process)
- Introduced append-only agent timeline events
- Exposed timeline API endpoint (GET /tickets/:id/timeline)
- Added Next.js proxy route for API access
- Built initial Ticket page UI to render agent timeline
- Hardened server-side fetching and error handling
- Fixed App Router layout requirements and global styles

## Authentication

Phase 8 adds first-party authentication, organization memberships, refresh-token rotation, tenant-aware API guards, and role-based authorization. The browser now talks to Next.js route handlers, which store access and refresh tokens in HttpOnly cookies (`au_access_token`, `au_refresh_token`) plus the selected tenant cookie (`au_organization_id`) and forward a verified `X-Organization-Id` header to the Nest API.

For local development, seed data now creates a demo owner account:

- Email: `demo.owner@example.com`
- Password: `DemoPassword123!`

Primary browser entry points:

- `/login`
- `/register`
- `/tickets`
- `/knowledge`
- `/settings`

See [docs/AUTH.md](/C:/Autonomous-CSA/docs/AUTH.md) for the request flow, cookie/header contract, RBAC behavior, and bootstrap details. See [docs/PHASE_8_AUTH_TENANCY.md](/C:/Autonomous-CSA/docs/PHASE_8_AUTH_TENANCY.md) for the full Phase 8 closeout report.

## Observability And Operations

Phase 9 adds structured logs, request and job correlation, `/health/live`, `/health/ready`, Prometheus `/metrics`, queue failure persistence, dead-letter handling, and a tenant-scoped `/operations` UI for runs, failures, and audit search/export.

See:

- [docs/OBSERVABILITY.md](/C:/Autonomous-CSA/docs/OBSERVABILITY.md)
- [docs/OPERATIONS.md](/C:/Autonomous-CSA/docs/OPERATIONS.md)
- [docs/QUEUE_FAILURES.md](/C:/Autonomous-CSA/docs/QUEUE_FAILURES.md)

## CI/CD

GitHub Actions now cover quality checks, Prisma migration validation, security scanning, Docker build readiness, CodeQL, and Dependabot hygiene. See [docs/CI_CD.md](/C:/Autonomous-CSA/docs/CI_CD.md) for the workflow breakdown, local equivalent commands, and failure handling guidance.

## Phase 11 Staging

Phase 11 is split into two tracks:

- Phase 11A: zero-cost production-like local and CI staging verification
- Phase 11B: hosted Fly.io staging deployment, explicitly deferred by the zero-spend infrastructure policy

The Fly.io foundation remains in the repository for future use. The trial verified hosted PostgreSQL `18.3` and provisioned the Redis fallback, but trial machines could not remain running longer than five minutes and no billing method will be attached.

The repo includes separate Fly manifests for future hosted staging:

- `fly.web.toml`
- `fly.api.toml`
- `fly.worker.toml`
- `fly.redis.toml`

Active Phase 11A local staging commands:

- `pnpm staging:local:up`
- `pnpm staging:local:verify`
- `pnpm staging:local:logs`
- `pnpm staging:local:down`
- `pnpm staging:local:reset`

These commands use `docker-compose.staging.yml`, PostgreSQL 18, persistent Redis, production API/worker/web images, a dedicated migration container, generated local-only secrets under ignored `run-output/`, and deterministic LLM behavior. Hosted staging is not complete and production deployment is not approved.

See:

- [docs/STAGING_PLATFORM_DECISION.md](/C:/Autonomous-CSA/docs/STAGING_PLATFORM_DECISION.md)
- [docs/STAGING_ARCHITECTURE.md](/C:/Autonomous-CSA/docs/STAGING_ARCHITECTURE.md)
- [docs/STAGING_ENVIRONMENT.md](/C:/Autonomous-CSA/docs/STAGING_ENVIRONMENT.md)
- [docs/STAGING_DEPLOYMENT.md](/C:/Autonomous-CSA/docs/STAGING_DEPLOYMENT.md)
- [docs/STAGING_VERIFICATION.md](/C:/Autonomous-CSA/docs/STAGING_VERIFICATION.md)

## Phase 10 Hardening

Local Docker infrastructure now uses PostgreSQL 18 for the `postgres` service. PostgreSQL 18 stores data under a version-specific `PGDATA` path (`/var/lib/postgresql/18/docker`) and the Compose volume is mounted at `/var/lib/postgresql` through the new `postgres-data-v18` volume. The previous PostgreSQL 16 volume is intentionally retained as a temporary rollback source until migration sign-off and the agreed retention window have both completed.

Operational hardening commands:

- `pnpm db:migrate:check`
- `pnpm db:backup`
- `pnpm db:restore <backup-file> --target-database-url=...`
- `pnpm db:backup:verify <backup-file>`
- `pnpm load:smoke`
- `pnpm load:staging`
- `pnpm staging:smoke`
- `pnpm maintenance:cleanup`
- `./scripts/staging-readiness.sh`

Supporting docs:

- [docs/SECURITY_DEPENDENCIES.md](/C:/Autonomous-CSA/docs/SECURITY_DEPENDENCIES.md)
- [docs/BACKUP_RESTORE.md](/C:/Autonomous-CSA/docs/BACKUP_RESTORE.md)
- [docs/LOAD_TESTING.md](/C:/Autonomous-CSA/docs/LOAD_TESTING.md)
- [docs/MIGRATIONS.md](/C:/Autonomous-CSA/docs/MIGRATIONS.md)
- [docs/SECRETS.md](/C:/Autonomous-CSA/docs/SECRETS.md)
- [docs/STAGING_READINESS.md](/C:/Autonomous-CSA/docs/STAGING_READINESS.md)
- [docs/FAILURE_INJECTION.md](/C:/Autonomous-CSA/docs/FAILURE_INJECTION.md)
# Support Channel Integration

Phase 12 adds zero-spend mock support channel integration with raw-byte webhook signatures and DB-backed inbound dispatch recovery. Start with `/channels` to create a `MOCK_EMAIL` connection, then use:

```powershell
pnpm channel:mock:inbound
pnpm channel:mock:duplicate
pnpm channel:mock:invalid-signature
pnpm channel:mock:reply
pnpm channel:mock:delivery
```

See `docs/CHANNEL_ARCHITECTURE.md`, `docs/CHANNEL_WEBHOOK_SECURITY.md`, `docs/CHANNEL_OUTBOX.md`, and `docs/CHANNEL_TESTING.md`.
