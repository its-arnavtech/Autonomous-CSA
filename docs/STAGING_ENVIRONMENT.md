# Staging Environment

Status: matrix defined; secret values are intentionally absent.

## Configuration Matrix

| Variable | Staging requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_ENV` | `staging` |
| `APP_VERSION` | Release candidate or staging version, for example `1.0.0-staging` |
| `GIT_SHA` | Exact deployed commit SHA |
| `BUILD_TIMESTAMP` | Build timestamp from CI |
| `DATABASE_URL` | Hosted PostgreSQL 18 URL, not localhost, not production |
| `REDIS_URL` | Hosted staging Redis URL, private preferred, not localhost |
| `RATE_LIMIT_REDIS_URL` | Use only if a separate rate-limit Redis is provisioned; otherwise isolate by staging Redis database/keyspace |
| `JWT_ACCESS_SECRET` | Staging-only secret from protected secret store |
| `JWT_REFRESH_SECRET` | Separate staging-only secret from protected secret store |
| `JWT_ACCESS_TTL` | `15m` unless explicitly changed |
| `JWT_REFRESH_TTL` | `7d` unless explicitly changed |
| `AUTH_COOKIE_NAME_PREFIX` | Staging-specific value, for example `stg_au` |
| `AUTH_COOKIE_DOMAIN` | Staging domain only |
| `AUTH_COOKIE_SECURE` | `true` |
| `AUTH_COOKIE_SAME_SITE` | `lax` unless cross-site hosting requires `none` with secure cookies |
| `CORS_ALLOWED_ORIGINS` | Exact staging web origin only; no wildcard |
| `TRUST_PROXY` | Provider-specific value after platform selection |
| `WEB_PUBLIC_URL` | Public staging web HTTPS URL |
| `API_BASE_URL` | Public or private staging API URL used by web |
| `INTERNAL_API_URL` | Private API URL if supported |
| `METRICS_ENABLED` | `true` |
| `METRICS_AUTH_TOKEN` | Staging-only token |
| `SWAGGER_ENABLED` | `false` by default in staging |
| `LOG_LEVEL` | `info` |
| `LOG_FORMAT` | JSON in hosted staging |
| `SHUTDOWN_GRACE_MS` | At least API readiness timeout |
| `WORKER_SHUTDOWN_GRACE_MS` | Long enough for active jobs to finish or retry |
| `QUEUE_*` | Same defaults as production hardening unless load tests show a reason to change |
| `AI_PROVIDER` | `deterministic` unless separate staging LLM keys and budgets are approved |
| `AI_API_KEY` | Staging-only provider key when real provider is enabled |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Do not set unless provider-specific integration is enabled |
| `AI_ENABLE_FALLBACK` | `true` |
| `AI_MAX_OUTPUT_TOKENS` | Bounded staging limit |
| `BACKUP_*` | Staging-only destination and retention |
| `RETENTION_*` | Staging disposable-data policy |
| `STAGING_*` smoke variables | GitHub environment secrets or operator shell only |

## Fly App Secrets

Set these with `flyctl secrets set --app <app> ...`; do not commit values.

API:

- `DATABASE_URL`
- `REDIS_URL`
- `RATE_LIMIT_REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `METRICS_AUTH_TOKEN`
- `STAGING_OWNER_EMAIL`
- `STAGING_ADMIN_EMAIL`
- `STAGING_AGENT_EMAIL`
- `STAGING_VIEWER_EMAIL`
- `STAGING_USER_PASSWORD_HASH`

Worker:

- `DATABASE_URL`
- `REDIS_URL`
- `METRICS_AUTH_TOKEN`
- LLM provider key only if real staging LLM keys are supplied

Web:

- No database, Redis, JWT signing, metrics, or LLM secrets.

GitHub `staging` environment:

- `FLY_API_TOKEN`
- `STAGING_SMOKE_EMAIL`
- `STAGING_SMOKE_PASSWORD`
- `STAGING_METRICS_AUTH_TOKEN`
- `STAGING_REDIS_URL`

Recommended GitHub variables:

- `STAGING_PLATFORM_CONFIRMED=true`
- `STAGING_COST_APPROVED=true` only after approving the cost preview
- `FLY_API_APP=autonomous-csa-staging-api`
- `FLY_WORKER_APP=autonomous-csa-staging-worker`
- `FLY_WEB_APP=autonomous-csa-staging-web`
- `STAGING_API_URL=https://autonomous-csa-staging-api.fly.dev`
- `STAGING_WEB_URL=https://autonomous-csa-staging-web.fly.dev`

## Validation Rules Implemented

- Staging web config rejects localhost URLs.
- Staging web config requires secure cookies and a cookie domain.
- Staging API config rejects wildcard CORS and localhost Postgres/Redis.
- Swagger defaults off in staging.
- Metrics token is required when metrics are enabled in production-like environments.
- Staging seed refuses to run unless `APP_ENV=staging`.
