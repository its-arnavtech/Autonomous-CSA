# Staging Architecture

Status: Phase 11A local/CI architecture is active. Phase 11B Fly.io hosted architecture is defined and partially trial-provisioned, but hosted verification is deferred by the zero-spend infrastructure policy.

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

## Phase 11A Local Topology

`docker-compose.staging.yml` mirrors the required topology without paid services:

| Component | Service | Notes |
| --- | --- | --- |
| Web | `web` | Production Next.js image, exposed on host port `3100`. |
| API | `api` | Production NestJS image, exposed on host port `3101`. |
| Worker | `worker` | Production worker image, health exposed on host port `3102`. |
| Migration owner | `migration` | One-shot API image command running Prisma `migrate deploy`. |
| PostgreSQL | `postgres` | `postgres:18-alpine`, persistent `staging-postgres-v18` volume. |
| Redis | `redis` | `redis:7-alpine`, append-only persistence, persistent `staging-redis-data` volume. |

## Current URLs

Selected Fly app names and default Fly URLs:

| Service | Fly app | URL |
| --- | --- | --- |
| Web | `autonomous-csa-staging-web` | `https://autonomous-csa-staging-web.fly.dev` |
| API | `autonomous-csa-staging-api` | `https://autonomous-csa-staging-api.fly.dev` |
| Worker | `autonomous-csa-staging-worker` | Private health check only |

Internal API URL for Fly private networking: `http://autonomous-csa-staging-api.internal:3001`.

PostgreSQL app name to use after cost approval: `autonomous-csa-staging-pg18`.

Redis service name: `autonomous-csa-staging-redis`. Upstash add-on creation was blocked for the trial organization, so the current resource is a private Redis Fly app with encrypted 1GB volume `redis_data`.

## Release Identity

Every image and deployment must carry:

- `APP_VERSION`
- `GIT_SHA`
- `APP_ENV=staging`
- `BUILD_TIMESTAMP`

The API, worker, and web now expose safe deployment metadata through `/version` or `/api/version`.
