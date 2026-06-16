# Staging Platform Decision Memo

Status: Fly.io approved for Phase 11 staging. Provisioning remains blocked until cost approval, Fly CLI authentication, and GitHub authentication are available.

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

Fly.io is the selected Phase 11 staging platform. It best matches the current Docker-based architecture, supports separate long-running API, worker, and web services, and has native release/rollback concepts.

## PostgreSQL Decision

Fly Managed Postgres currently documents managed capabilities around PostgreSQL 16-era extensions, so it cannot be assumed to satisfy the Phase 11 PostgreSQL 18 hard gate. The staging database path is an unmanaged Fly Postgres app pinned to `flyio/postgres-flex:18`, which was locally verified with:

```powershell
docker run --rm --entrypoint postgres flyio/postgres-flex:18 --version
```

Result: `postgres (PostgreSQL) 18.3`.

Do not provision Fly Managed Postgres unless Fly explicitly exposes PostgreSQL 18 for the selected organization at provisioning time.

## Redis Decision

Use Fly-integrated Upstash Redis only on a fixed-price plan with eviction disabled if a live BullMQ compatibility test passes. Fly's Upstash docs explicitly call out BullMQ workloads and recommend fixed-price plans for BullMQ-like software. Upstash documents private Fly organization connectivity, backups, transactions, key expiry, and eviction controls.

If the compatibility test fails for BullMQ `Queue`, `Worker`, `QueueEvents`, delayed jobs, Lua scripts, streams, or reconnect behavior, provision a dedicated private Redis service on Fly Machines with persistence instead.

## Cost Preview

Smallest practical staging estimate in `ord`, running continuously:

| Resource | Size | Estimated monthly cost |
| --- | --- | --- |
| Web Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| API Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| Worker Machine | `shared-cpu-1x`, 512MB | about `$3.19` |
| PostgreSQL 18 Machine | Fly Postgres development single node, 256MB, 1GB disk | about `$2` per Fly pricing example |
| Postgres volume | 1GB | about `$0.15` |
| Volume snapshots | first 10GB free, then `$0.08/GB-month` | expected `$0` at small staging size |
| Redis | Upstash fixed-price plan, eviction disabled | confirm exact plan price before creating |
| Backup storage | Tigris or equivalent object storage | depends on selected bucket usage; keep under a few GB for staging |
| Public outbound bandwidth | bounded smoke/load only | Fly lists North America public egress at `$0.02/GB` |

Provisioning is blocked until this cost preview is explicitly approved.

## Required Input

- Provide staging app/service names.
- Provide staging web and API domains.
- Provide provider credentials through GitHub environment secrets or OIDC.
- Confirm PostgreSQL 18 and Redis provisioning choices.
- Confirm backup artifact storage outside the database service filesystem.
- Approve the cost preview.
- Install and authenticate `flyctl`.
- Re-authenticate GitHub CLI.

No live deployment, release-candidate tag, hosted backup, restore drill, load test, or rollback demonstration can be completed until the remaining gates above are satisfied.
