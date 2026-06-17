# Documentation Index

## Architecture

- [Final system overview](FINAL_SYSTEM_OVERVIEW.md): purpose, workflows, components, security, reliability, deployment, and limitations.
- [Architecture](ARCHITECTURE.md): authoritative system and sequence diagrams.
- [Tradeoffs](tradeoffs.md): design decisions and alternatives.

## Authentication And Tenancy

- [Authentication](AUTH.md): token, cookie, membership, and RBAC contracts.
- [Phase 8 closeout](PHASE_8_AUTH_TENANCY.md): historical implementation record; current validation numbers live in the final report.

## Agent Runtime

- [Architecture](ARCHITECTURE.md): Router/Retriever/Resolver/Critic flow and persistence boundaries.
- [Queue failures](QUEUE_FAILURES.md): retry, failure, dead-letter, and replay operations.

## Knowledge And Guardrails

- [Final overview](FINAL_SYSTEM_OVERVIEW.md): knowledge retrieval and decision policy.
- [Secrets](SECRETS.md): secret handling and rotation expectations.

## Operations

- [Operations](OPERATIONS.md): dashboard, audit, and failure workflows.
- [Observability](OBSERVABILITY.md): logs, correlation, metrics, and health.
- [Runbook](runbook.md) and [service runbooks](runbooks): incident procedures.
- [Failure injection](FAILURE_INJECTION.md): outage and restart drills.
- [Load testing](LOAD_TESTING.md): bounded test procedures and claim limits.

## Support Channels

- [Channel architecture](CHANNEL_ARCHITECTURE.md)
- [Webhook security](CHANNEL_WEBHOOK_SECURITY.md)
- [Transactional outbox](CHANNEL_OUTBOX.md)
- [Provider adapters](CHANNEL_PROVIDER_ADAPTERS.md)
- [Operations](CHANNEL_OPERATIONS.md)
- [Testing](CHANNEL_TESTING.md)

## Backup And Restore

- [Backup and restore](BACKUP_RESTORE.md): PostgreSQL client compatibility, checksums, restore verification, and retention.
- [Migrations](MIGRATIONS.md): migration policy and PostgreSQL 18 transition.
- [Restore procedure](runbooks/RESTORE_PROCEDURE.md)

## Staging And Deployment

- [Staging architecture](STAGING_ARCHITECTURE.md)
- [Environment contract](STAGING_ENVIRONMENT.md)
- [Local verification](STAGING_VERIFICATION.md)
- [Platform and zero-spend decision](STAGING_PLATFORM_DECISION.md)
- [Deployment foundation](STAGING_DEPLOYMENT.md)
- [Readiness](STAGING_READINESS.md) and [rollback](STAGING_ROLLBACK.md)
- [CI/CD](CI_CD.md)

## Security

- [Final security audit](FINAL_SECURITY_AUDIT.md): authoritative v1.0 finding classification.
- [Dependency security](SECURITY_DEPENDENCIES.md)
- [Secrets](SECRETS.md)

## Testing

- [Final validation report](FINAL_VALIDATION_REPORT.md): authoritative final counts and measured local results.
- [Channel testing](CHANNEL_TESTING.md)
- [Staging verification](STAGING_VERIFICATION.md)
- [Load testing](LOAD_TESTING.md)

## Final Release

- [v1 release notes](RELEASE_NOTES_V1.md)
- [Known limitations](KNOWN_LIMITATIONS.md)
- [Portfolio summary](PORTFOLIO_SUMMARY.md)
- [Interview guide](INTERVIEW_GUIDE.md)
- [Demo script](DEMO_SCRIPT.md)
- [Current status](status.md)

Historical phase documents remain implementation records, not sources for current test counts or release status. The final validation report and known-limitations document are authoritative for v1.0.
