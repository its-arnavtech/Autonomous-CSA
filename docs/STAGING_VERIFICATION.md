# Staging Verification

Status: verification plan and automation are present; hosted verification is not complete. Current blocker is Fly trial billing: staging Machines are stopped after five minutes until billing is attached to the organization.

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

## Manual Hosted Gates

The following remain blocked until staging exists:

- Tenant isolation and forged organization rejection
- Full RBAC matrix
- Worker job processing persistence
- Guardrail persistence
- CSV export
- Correlation IDs in hosted logs
- Hosted backup
- Restore into separate verification database
- Bounded load test metrics
- Deployment during traffic
- API, worker, and web restart drills
- Redis recovery drill
- Postgres recovery drill
- LLM failure drills
- Rollback demonstration
- Release-candidate tag

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

Live attempt notes:

- PostgreSQL 18 hosted version passed: `18.3 (Ubuntu 18.3-1.pgdg24.04+1)`.
- Fly Upstash Redis add-on creation was blocked for the trial organization.
- Private Redis fallback app deployed, but Fly trial limits stopped the Machine after five minutes.
- The Redis/BullMQ gate cannot be accepted until the fallback Redis service runs durably and `pnpm staging:redis:check` passes against the hosted endpoint.
