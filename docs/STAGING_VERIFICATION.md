# Staging Verification

Status: Phase 11A local/CI verification is active. Phase 11B hosted Fly verification is deferred by the zero-spend infrastructure policy. No billing method will be attached to Fly.io, and hosted staging must not be claimed complete.

## Phase 11A Local Commands

```powershell
pnpm staging:local:up
pnpm staging:local:verify
pnpm staging:local:regression
pnpm staging:local:logs
pnpm staging:local:down
pnpm staging:local:reset
```

`pnpm staging:local:verify` generates ignored local secrets, starts the production Docker stack from `docker-compose.staging.yml`, applies Prisma migrations through the migration container, verifies readiness/version metadata, runs Redis/BullMQ compatibility, runs the guarded staging seed twice for idempotency, runs the staging smoke test, runs the local tenant/RBAC regression gate, and performs local PostgreSQL backup/restore verification.

## Automated Smoke Test

Command:

```powershell
pnpm staging:smoke
```

Required environment:

- `STAGING_WEB_URL`
- `STAGING_API_URL`
- `STAGING_SMOKE_EMAIL`
- `STAGING_SMOKE_PASSWORD`
- `METRICS_AUTH_TOKEN` when authenticated metrics are checked
- `EXPECTED_GIT_SHA` when verifying an exact release candidate

Coverage:

- Web loads
- API liveness
- API readiness
- Version endpoint
- Login
- `/auth/me`
- Refresh
- Ticket list
- Ticket create
- Ticket detail
- Knowledge search
- Operations summary
- Metrics unauthenticated rejection
- Logout

## Local Regression Gate

Command:

```powershell
pnpm staging:local:regression
```

Coverage:

- OWNER, ADMIN, AGENT, and VIEWER login
- `/auth/me` for every seeded role
- Refresh rotation and revoked refresh rejection
- Valid organization access
- Forged organization rejection
- Read access for all roles
- Ticket mutation allowed for OWNER, ADMIN, and AGENT
- Ticket mutation rejected for VIEWER
- Organization settings management rejected for AGENT
- Operations summary, runs, failures, audit, and CSV export

## Deferred Hosted Gates

The following remain deferred until the zero-spend policy changes and Phase 11B is explicitly re-enabled:

- Correlation IDs in hosted logs
- Hosted backup
- Restore into separate verification database
- Bounded load test metrics
- Deployment during traffic
- API, worker, and web restart drills
- Redis recovery drill
- Postgres recovery drill
- LLM failure drills
- Hosted rollback demonstration
- Hosted release-candidate tag

## Fly-Specific Checks

- `flyctl checks list --app autonomous-csa-staging-api`
- `flyctl checks list --app autonomous-csa-staging-worker`
- `flyctl checks list --app autonomous-csa-staging-web`
- `flyctl logs --app autonomous-csa-staging-api`
- `flyctl logs --app autonomous-csa-staging-worker`
- `flyctl releases --app autonomous-csa-staging-api`

PostgreSQL version check after provisioning:

```powershell
flyctl postgres connect --app autonomous-csa-staging-pg18
SHOW server_version;
```

Redis BullMQ compatibility must be verified with a live Queue, Worker, QueueEvents, delayed job, Lua script, transaction, stream, key expiry, and reconnect test before staging can pass.

Automated command:

```powershell
pnpm staging:redis:check
```

Hosted Fly attempt notes:

- PostgreSQL 18 hosted version passed: `18.3 (Ubuntu 18.3-1.pgdg24.04+1)`.
- Fly Upstash Redis add-on creation required billing configuration for the trial organization.
- Private Redis fallback app deployed, but trial machines could not remain running longer than five minutes.
- The Redis/BullMQ hosted gate is deferred by the zero-spend policy. Local/CI Redis/BullMQ verification is the active Phase 11A gate.
# Phase 12 Channel Verification Addendum

Use the local production-like staging stack with mock channels only.

Required channel checks:

1. Create a mock channel connection.
2. Send a signed inbound mock webhook.
3. Verify receipt, customer, conversation, external message, ticket, timeline, and queued agent run.
4. Approve the generated draft.
5. Verify `OutboundMessage`, `DeliveryAttempt`, and timeline delivery events.
6. Send a duplicate webhook and confirm no duplicate ticket/message/run.
7. Test retryable and permanent mock failure modes.
8. Confirm dead-letter and owner/admin replay behavior.

These checks were documented but not fully executed in this workspace during the implementation turn.
