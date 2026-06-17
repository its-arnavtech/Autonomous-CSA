# Final Validation Report

Local validation date: June 17, 2026. Platform: Windows host with Docker Desktop. Source base recorded by generated artifacts: `f8b3a9e67ecf`, plus the Phase 13 working-tree changes documented in this report. Commit-level CI is required before merge/tag.

## Root Gates

| Gate | Result |
| --- | --- |
| Prisma generate / validate | Passed |
| Lint | Passed, 5 workspaces |
| Typecheck | Passed, 5 workspaces |
| Unit/script tests | Passed, 212 tests |
| Production build | Passed, 5 workspaces |
| Dependency audit at low severity | Passed, no known vulnerabilities |
| Outdated dependency check | Passed, no reported outdated packages |
| Production Docker image builds | Passed: API, worker, web |

Exact automated test count after the redaction regression: API 90, worker 91, web 7, Node script utilities 24; total 212. Packages that intentionally contain no independent test runner are not counted as tests.

## Database And Infrastructure

| Check | Result |
| --- | --- |
| Fresh PostgreSQL database | Passed from empty named volume |
| Migration deploy | Passed, 13 migrations |
| Existing database / idempotent redeploy | Passed, no pending migrations |
| Destructive migration heuristic | Passed, no destructive statement required |
| PostgreSQL server/client | 18.4 / 18.4 |
| Seed idempotency | Passed twice, 4 synthetic role users |
| Redis/BullMQ | Passed Lua, transactions, expiry, streams, queue, worker, events, delayed jobs, reconnect |
| Backup | Passed, 354,976-byte custom dump plus SHA-256 metadata |
| Restore | Passed into isolated database; 13 migrations and 4 users verified |

The final repeatability drill also backed up and restored the cumulative synthetic channel dataset. Counts matched before/after for 4 connections, 88 external customers, 88 conversations, 116 external messages, 116 receipts, 28 outbound messages, 60 delivery attempts, and 88 inbound dispatches.

## Channel And Reliability Gates

- Signed raw-byte inbound workflow persisted one receipt/customer/conversation/message/dispatch, created a ticket and run, executed 4 agent steps, 1 retrieval, 6 guardrail checks, and 1 draft.
- Concurrent duplicate webhook created exactly one receipt, external message, conversation, ticket, and dispatch.
- Approved outbound reached `DELIVERED` with one attempt and one sent/delivered event. Duplicate approval produced one outbound message.
- Timeout, HTTP 429, and HTTP 503 scenarios recovered after 3 attempts each.
- Invalid-recipient and malformed-message scenarios dead-lettered after 1 attempt and created visible operational failures.
- Redis-down inbound/outbound recovery, worker restart, API restart, Redis restart, PostgreSQL outage/restart, and stale work reconciliation passed.
- Forged organization access was rejected; VIEWER channel management was rejected; attachment filename became `dangerous_script_.pdf`.

## Bounded Local Load

The final mock-channel verifier issued 20 requests at concurrency 5 in 1,066 ms. Measured latency was p50 75 ms, p95 329 ms, and p99 364 ms, with 0% request errors and 9 duplicates suppressed. This is a bounded local correctness/load drill, not a production capacity claim or SLA.

## Initial Failure And Resolution

The first Phase 13 demo run failed because cleanup removed every file under `apps/web/public`, while the Dockerfile copied that directory. A tracked `.gitkeep` restored the required build context without reintroducing unused starter assets. A fresh-volume rerun then passed the complete demo.

An exact sequential run of the staging, channel, and demo commands later exposed shared synthetic login counters: individually passing suites accumulated enough successful owner logins to trigger the real Redis auth limiter. Both local verifier entry points now clear only `rate-limit:auth:*` under an explicit `ALLOW_LOCAL_STAGING=true` guard before their synthetic logins. Production settings and application rate-limit behavior are unchanged.

## External Gates

Local gates are green. PR CI, merge state, clean `main`, and tag publication are intentionally unresolved until the branch is committed/pushed and GitHub reports all required checks green. The v1.0.0 tag must not be created earlier.
