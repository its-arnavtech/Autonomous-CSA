# Observability

Phase 9 adds a shared observability foundation under `packages/observability` and wires it into the API, worker, and Next.js proxy layer.

## What is included

- Structured service logs for `api`, `worker`, and `web`
- Correlation IDs via `X-Correlation-Id`
- Safe log redaction for auth headers, cookies, tokens, passwords, secrets, and large customer bodies
- Liveness and readiness endpoints
- Prometheus-compatible `/metrics`
- Slow Prisma query logging with `DB_SLOW_QUERY_MS`

## Correlation flow

1. Browser or caller sends `X-Correlation-Id`, or the proxy/API generates one.
2. Next.js forwards the correlation ID to Nest.
3. The API returns the same header to the browser.
4. Ticket enqueue stores the correlation ID on `AgentRun` and in the BullMQ payload.
5. Worker processing rehydrates the correlation context and persists it on `AgentEvent`.

## Health endpoints

- API: `/health`, `/health/live`, `/health/ready`
- Worker: `/health`, `/health/live`, `/health/ready`

Readiness checks Postgres, Redis, and minimum required config with bounded timeouts.

## Metrics

- `/metrics` is enabled unless `METRICS_ENABLED=false`
- Set `METRICS_AUTH_TOKEN` to require a bearer token
- Metrics avoid tenant IDs, ticket IDs, user IDs, and correlation IDs as labels

## Redaction

The shared sanitizer removes or summarizes:

- `authorization`
- `cookie`
- access and refresh tokens
- password and token hash fields
- provider API keys
- connection strings
- raw prompt/response/customer message bodies
