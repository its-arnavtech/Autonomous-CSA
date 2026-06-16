# Staging Platform Decision Memo

Status: Phase 11 is split into zero-cost Phase 11A local/CI staging verification and Phase 11B hosted staging deployment. Fly.io remains the selected hosted platform foundation for future use, but Phase 11B is explicitly deferred by the zero-spend infrastructure policy. No billing method will be attached, no paid resources will be created, and no additional live Fly resources should be provisioned.

## Zero-Cost Decision

Fly.io app manifests, deployment workflow scaffolding, and runbooks remain in the repository. During the Fly trial, the API, worker, web, PostgreSQL 18, and Redis fallback app shells were created; hosted PostgreSQL was verified as `18.3 (Ubuntu 18.3-1.pgdg24.04+1)`. The Redis fallback was also provisioned, but trial machines could not remain running longer than five minutes.

This is an explicit infrastructure-cost decision, not a technical failure. Hosted staging gates are deferred because the project will not attach billing information to Fly.io or move to another provider that requires billing information.

## Repository Signals

- Existing Dockerfiles are present for web, API, and worker.
- Existing CI builds Docker images but does not deploy them.
- `docs/CI_CD.md` previously mentioned future Fly.io release jobs, but no Fly.io manifests, app names, secrets, or deploy workflow are committed.
- No locked staging domain, platform service manifest, registry target, database provider, Redis provider, or deployment credentials are present.

## Options Compared

| Option | Fit | Tradeoffs |
| --- | --- | --- |
| Fly.io | Strong fit for Docker services, private networking, health checks, releases, rollback, managed Postgres options, and student-project cost control. | PostgreSQL 18 availability must be verified before provisioning; Redis may require Upstash/Redis-compatible service integration. |
| Render | Simple Docker-backed web services, managed Postgres, Redis, health checks, logs, and rollbacks. | Worker/private network behavior and PostgreSQL 18 availability must be confirmed for the selected plan. |
| Railway | Fast setup for Docker apps, Postgres, Redis, logs, and low-friction staging environments. | Production-like rollout controls, private networking, and rollback/digest workflows are less explicit than Fly.io. |

## Decision

Fly.io is the selected future hosted staging platform. It best matches the current Docker-based architecture, supports separate long-running API, worker, and web services, and has native release/rollback concepts. The Fly foundation is complete enough to keep for a future paid-hosting decision, but it is not part of the active zero-cost Phase 11A gate.

## PostgreSQL Decision

Fly Managed Postgres currently documents managed capabilities around PostgreSQL 16-era extensions, so it cannot be assumed to satisfy the Phase 11 PostgreSQL 18 hard gate. The staging database path is an unmanaged Fly Postgres app pinned to `flyio/postgres-flex:18`, which was locally verified with:

```powershell
docker run --rm --entrypoint postgres flyio/postgres-flex:18 --version
```

Result: `postgres (PostgreSQL) 18.3`.

Do not provision Fly Managed Postgres unless Fly explicitly exposes PostgreSQL 18 for the selected organization at provisioning time.

## Redis Decision

Use Fly-integrated Upstash Redis only on a fixed-price plan with eviction disabled if a live BullMQ compatibility test passes. Fly's Upstash docs explicitly call out BullMQ workloads and recommend fixed-price plans for BullMQ-like software. Upstash documents private Fly organization connectivity, backups, transactions, key expiry, and eviction controls.

Fly Upstash add-on creation was attempted for `autonomous-csa-staging-redis`, but Fly add-ons require billing configuration for the trial organization. The fallback is a dedicated private Redis Fly app using `fly.redis.toml`, `ops/redis/Dockerfile`, a `shared-cpu-1x` 256MB Machine, and a 1GB encrypted `redis_data` volume.

The fallback Redis service still must pass the live BullMQ compatibility gate for `Queue`, `Worker`, `QueueEvents`, delayed jobs, Lua scripts, streams, reconnect behavior, transactions, and key expiry before Phase 11B can proceed. Under the zero-spend policy, this hosted gate is deferred.

## Phase 11A Local/CI Staging

Active staging verification moves to `docker-compose.staging.yml` and `.env.staging.example`.

Phase 11A runs production Docker images locally and in CI without paid services:

- PostgreSQL 18
- Redis with append-only persistence
- API, worker, and web production builds
- a dedicated migration container as sole migration owner
- staging-only runtime validation via `ALLOW_LOCAL_STAGING=true`
- generated local secrets in ignored `run-output/staging-local.env`
- smoke, Redis/BullMQ, backup, restore, and bounded load gates where tooling is available

## Deferred Hosted Cost Preview

Smallest practical staging estimate in `ord`, running continuously:

| Resource | Size | Estimated monthly cost |
| --- | --- | --- |
| Web Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| API Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| Worker Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| PostgreSQL 18 Machine | Fly Postgres development single node, 256MB, 1GB disk | about `$2` per Fly pricing example |
| Postgres volume | 1GB | about `$0.15` |
| Volume snapshots | first 10GB free, then `$0.08/GB-month` | expected `$0` at small staging size |
| Redis fallback Machine | `shared-cpu-1x`, 256MB | about `$1.94` |
| Redis fallback volume | 1GB | about `$0.15` |
| Backup storage | Tigris or equivalent object storage | depends on selected bucket usage; keep under a few GB for staging |
| Public outbound bandwidth | bounded smoke/load only | Fly lists North America public egress at `$0.02/GB` |

The fallback footprint would be about `$13.75/mo` before traffic, taxes, support, dedicated IPs, larger machines, or backup object storage. This is documented only for future planning; it is not approved for spend under the current zero-cost policy.

## Required Input

- Provide staging app/service names.
- Provide staging web and API domains.
- Provide provider credentials through GitHub environment secrets or OIDC.
- Confirm PostgreSQL 18 and Redis provisioning choices.
- Confirm backup artifact storage outside the database service filesystem.
- Complete Phase 11A local and CI staging gates.
- Do not attach billing to Fly.io.
- Do not provision additional hosted resources.
- Keep hosted Fly deployment manual and disabled unless the zero-spend policy changes.

No hosted release-candidate tag, hosted backup, hosted restore drill, hosted load test, or hosted rollback demonstration can be completed while Phase 11B is deferred.
