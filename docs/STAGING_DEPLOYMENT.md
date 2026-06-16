# Staging Deployment

Status: Fly.io manifests and CI deployment path exist; live deployment is blocked until cost approval, `flyctl` authentication, and GitHub authentication are available.

## Implemented Repository Commands

```powershell
pnpm db:seed:staging
pnpm staging:smoke
pnpm load:staging
```

## Intended Deployment Order

1. Build API, worker, and web images with `GIT_SHA`, `APP_VERSION`, and `BUILD_TIMESTAMP`.
2. Scan images.
3. If the staging database contains data, create a hosted backup first.
4. Run `pnpm db:migrate:deploy` once from an explicit migration job.
5. Deploy API.
6. Wait for API `/health/ready`.
7. Deploy worker.
8. Wait for worker `/health/ready`.
9. Deploy web.
10. Run `pnpm staging:smoke`.
11. Run bounded `pnpm load:staging`.
12. Record image digests, migration state, smoke result, load metrics, and rollback target.

API and worker replicas must not run migrations automatically at startup.

## Current Workflow

`.github/workflows/staging-deploy.yml` runs validation, migration checks against CI Postgres 18, tests, build, audit, image build, image scan, GHCR push with SHA tags, Fly deploy, guarded seed, and hosted smoke tests.

The live deployment job is gated by both `vars.STAGING_PLATFORM_CONFIRMED == 'true'` and `vars.STAGING_COST_APPROVED == 'true'`.

## Local Tooling Status

Current check results from this workstation:

- `flyctl version`: failed; `flyctl` is not installed.
- `fly auth whoami`: failed; `fly` is not installed.
- `gh auth status`: failed; token for `its-arnavtech` is invalid.
- Docker: available, server version `29.5.2`.

Install and authenticate Fly CLI:

```powershell
iwr https://fly.io/install.ps1 -useb | iex
flyctl auth login
```

Re-authenticate GitHub CLI:

```powershell
gh auth login -h github.com
```

## Fly Provisioning Commands

Do not run these until cost approval is explicit.

```powershell
flyctl apps create autonomous-csa-staging-api --org <fly-org>
flyctl apps create autonomous-csa-staging-worker --org <fly-org>
flyctl apps create autonomous-csa-staging-web --org <fly-org>
```

PostgreSQL 18 must be pinned to `flyio/postgres-flex:18` or an explicitly verified Fly PostgreSQL 18 offering:

```powershell
flyctl postgres create --name autonomous-csa-staging-pg18 --org <fly-org> --region ord --image-ref flyio/postgres-flex:18
```

Redis must be provisioned only after BullMQ compatibility is verified. Preferred first test is Fly Upstash Redis fixed-price with eviction disabled:

```powershell
flyctl redis create
flyctl redis status autonomous-csa-staging-redis
```

If compatibility fails, use a dedicated private Redis Fly app with a persistent volume instead.

Compatibility command after setting `REDIS_URL` to the candidate Redis endpoint:

```powershell
pnpm staging:redis:check
```

## Migration Mechanism

`fly.api.toml` owns migrations through:

```toml
[deploy]
  release_command = "pnpm --dir /app --filter @agentic-support/db db:migrate:deploy"
```

This runs once as the API release command and must complete before the API rollout. API and worker startup commands do not run migrations.

## Required GitHub Environment

- Environment name: `staging`
- Protected deployment reviewers as needed
- Staging-only secrets for database, Redis, auth, metrics, LLM provider if enabled, and smoke credentials
- Provider credentials or OIDC trust after platform selection
