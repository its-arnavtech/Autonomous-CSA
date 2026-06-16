# Staging Rollback

Status: runbook defined; rollback not demonstrated because no live staging environment exists yet.

## Rollback Inputs

- Previously verified API image digest or SHA tag
- Previously verified worker image digest or SHA tag
- Previously verified web image digest or SHA tag
- Current migration status
- Confirmation that the rollback target is database-compatible

## Required Demonstration

1. Deploy release candidate A.
2. Verify A with `/version` and `pnpm staging:smoke`.
3. Deploy release candidate B.
4. Verify B with `/version` and `pnpm staging:smoke`.
5. Roll back API, worker, and web to A by digest or SHA tag without rebuilding.
6. Verify `/version` shows A again.
7. Confirm API and worker remain compatible with the current database schema.

## Fly Commands

```powershell
flyctl releases --app autonomous-csa-staging-api
flyctl releases --app autonomous-csa-staging-worker
flyctl releases --app autonomous-csa-staging-web

flyctl releases rollback <api-release-id> --app autonomous-csa-staging-api
flyctl releases rollback <worker-release-id> --app autonomous-csa-staging-worker
flyctl releases rollback <web-release-id> --app autonomous-csa-staging-web
```

After rollback, verify:

```powershell
Invoke-RestMethod https://autonomous-csa-staging-api.fly.dev/version
Invoke-RestMethod https://autonomous-csa-staging-web.fly.dev/api/version
pnpm staging:smoke
```

## Rollback Limits

Prisma migrations are forward-only in normal operation. A destructive schema rollback is not allowed as part of application rollback. Phase 11 rollback can only be considered safe when migrations are backward-compatible or no migration ran between A and B.
