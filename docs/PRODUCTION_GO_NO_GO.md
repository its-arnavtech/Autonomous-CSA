# Production Go/No-Go

Status: production is no-go. Phase 11A local/CI staging verification may be completed under the zero-spend policy, but Phase 11B hosted staging verification is explicitly deferred.

| Area | Gate | Status |
| --- | --- | --- |
| Security | No known high/critical vulnerabilities | Not verified for hosted RC |
| Security | Staging secrets isolated | Not verified |
| Security | Secure cookies and staging cookie names | Implemented in config; not hosted verified |
| Security | CORS exact origin | Implemented in config; not hosted verified |
| Security | Metrics protected | Implemented; smoke check pending |
| Security | Swagger disabled in staging | Implemented default; not hosted verified |
| Reliability | Readiness works | Local code exists; hosted pending |
| Reliability | Graceful shutdown works | Code exists; hosted drill pending |
| Reliability | Backup works | Hosted pending |
| Reliability | Restore works | Hosted pending |
| Reliability | Rollback works | Hosted pending |
| Reliability | Queue recovery works | Hosted pending |
| Application | Auth passes | Hosted pending |
| Application | Tenancy passes | Hosted pending |
| Application | RBAC passes | Hosted pending |
| Application | Ticket flow passes | Hosted pending |
| Application | Knowledge passes | Hosted pending |
| Application | Guardrails pass | Hosted pending |
| Application | Operations passes | Hosted pending |
| Deployment | Git SHA visible | Implemented via `/version`; hosted pending |
| Deployment | Image digests recorded | Workflow scaffold exists; hosted pending |
| Deployment | Migration state clean | Hosted pending |
| Deployment | Staging smoke passes | Hosted pending |
| Deployment | Load thresholds pass | Hosted pending |
| Deployment | Fly release rollback demonstrated | Hosted pending |
| Data | No real customer data | Seed uses reserved/example addresses |
| Data | Retention configured | Existing config; hosted pending |
| Data | Backup retention configured | Hosted pending |
| Data | Restore drill complete | Hosted pending |

Production review is no-go until Phase 11B hosted staging gates are explicitly re-enabled and pass. The current zero-spend policy does not approve production deployment, paid hosted staging, or an RC tag based only on local verification.
# Phase 12 Channel Gate

Support channels remain zero-spend and mock-first. Do not enable a real provider until provider-specific signing rules, replay windows, real credential storage, attachment scanning/download design, and provider-specific retry semantics are reviewed.

The Phase 12 mock-channel local gate passed on June 17, 2026 with `pnpm channel:staging:verify` after `pnpm staging:local:verify`. Evidence is in `run-output/channel-staging-results.json` and includes production-image E2E, backup/restore, load/concurrency checks, and Redis/Postgres/API/worker restart drills.

This does not change the overall production no-go above: hosted staging, paid infrastructure, and real-provider rollout remain blocked until explicitly re-enabled and reviewed.
