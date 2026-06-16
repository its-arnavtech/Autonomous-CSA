# Staging Architecture

Status: Fly.io target architecture defined; live provisioning is blocked on cost approval and local/auth prerequisites.

```text
Internet
  |
  v
Next.js Web service (public)
  |
  | HTTPS public API URL, or private API URL where the platform supports it
  v
NestJS API service (public)
  | \
  |  \ private Redis/BullMQ connection
  |   v
  |  Redis service (private)
  |       |
  |       v
  |  NestJS Worker service (private, no public user traffic)
  |
  v
PostgreSQL 18 database (private)
```

## Required Topology

| Component | Exposure | Notes |
| --- | --- | --- |
| Web | Public HTTPS | Serves Next.js UI and first-party proxy routes. |
| API | Public HTTPS | Exposes REST API, `/health/live`, `/health/ready`, `/version`, and protected `/metrics`. |
| Worker | Private preferred | Runs BullMQ processor and exposes health/readiness only where the provider requires checks. |
| PostgreSQL 18 | Private | Must be a fresh staging database with separate credentials and no PostgreSQL 16 volume reuse. |
| Redis | Private | Must be isolated from local and production rate-limit/queue state. |
| Backups | External artifact store | Must not store the only backup on the database service filesystem. |
| Logs | Staging-only stream | Must not share production log credentials or sinks. |
| Metrics | Staging-only protected endpoint/sink | `/metrics` requires `METRICS_AUTH_TOKEN` in production-like environments. |

## Current URLs

Selected Fly app names and default Fly URLs:

| Service | Fly app | URL |
| --- | --- | --- |
| Web | `autonomous-csa-staging-web` | `https://autonomous-csa-staging-web.fly.dev` |
| API | `autonomous-csa-staging-api` | `https://autonomous-csa-staging-api.fly.dev` |
| Worker | `autonomous-csa-staging-worker` | Private health check only |

Internal API URL for Fly private networking: `http://autonomous-csa-staging-api.internal:3001`.

PostgreSQL app name to use after cost approval: `autonomous-csa-staging-pg18`.

Redis database/service name to use after compatibility approval: `autonomous-csa-staging-redis`.

## Release Identity

Every image and deployment must carry:

- `APP_VERSION`
- `GIT_SHA`
- `APP_ENV=staging`
- `BUILD_TIMESTAMP`

The API, worker, and web now expose safe deployment metadata through `/version` or `/api/version`.
