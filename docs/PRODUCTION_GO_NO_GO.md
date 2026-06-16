# Production Go/No-Go

Status: checklist created for production review after Phase 11 staging gates pass.

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

Production review is no-go until all hosted staging gates are complete.
