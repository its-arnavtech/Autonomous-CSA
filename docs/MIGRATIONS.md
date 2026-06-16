# Migration Safety

## Philosophy

- Use forward-only migrations.
- Prefer expand and contract changes over destructive in-place edits.
- Take and verify a backup before applying migrations to production-like data.

## Checklist

- Run `pnpm db:validate`
- Run `pnpm db:migrate:check`
- Run `pnpm db:migrate:deploy` against a staging-like database
- Verify app compatibility with both pre- and post-migration states when possible
- Keep seed behavior safe for local and CI use only
- For PostgreSQL major-version upgrades, use logical dump and restore into a clean new volume. Do not reuse an older major-version data directory.

## PostgreSQL 18 Local Infrastructure Migration

- Local Docker Compose now uses `postgres:18-alpine`.
- The PostgreSQL 18 volume is `postgres-data-v18`, which Docker names `autonomous-csa_postgres-data-v18`.
- The PostgreSQL 18 volume is mounted at `/var/lib/postgresql`.
- `PGDATA` is set to `/var/lib/postgresql/18/docker`, matching the PostgreSQL 18 Docker image layout.
- The previous PostgreSQL 16 volume, `autonomous-csa_postgres-data`, is intentionally retained and must not be removed during the migration task.
- The migration path is verified logical dump and restore: validate checksum, restore into a clean PostgreSQL 18 database, compare selected table counts, run Prisma checks, create a fresh PostgreSQL 18 backup, and verify restoring that fresh backup.

### PostgreSQL 16 Volume Cleanup Criteria

Do not remove `autonomous-csa_postgres-data` until all of the following are true:

- PostgreSQL 18 restore has passed without errors.
- A fresh PostgreSQL 18 backup has been created and restore-verified.
- Phase 8 auth/tenant checks, Phase 9 observability/operations checks, and core ticket-processing checks have passed.
- The migration branch has been merged.
- A separate retention window has elapsed.

When those criteria are satisfied, an operator may remove the old volume manually:

```powershell
docker volume rm autonomous-csa_postgres-data
```

Do not run that command as part of the migration.

## Heuristic Checks

- `pnpm db:migrate:check` runs Prisma validate, Prisma migrate status, and a simple SQL heuristic scan for destructive statements.
- The heuristic scan is advisory only. It does not prove safety.

## Index And Query Review

- Reviewed the main Phase 10 query paths for tickets, ticket messages, agent runs, agent events, operational failures, refresh sessions, memberships, and audit exports.
- Existing Prisma indexes already cover the primary production-shaped filters:
  - tickets by `orgId`, `status`, and `updatedAt`
  - messages by `ticketId` and `orgId/ticketId/createdAt`
  - agent runs by `orgId/status/createdAt`
  - agent events by `orgId/ticketId/sequence`
  - operational failures by `organizationId/failedAt`
  - memberships by `userId` plus the unique `userId/organizationId` pair
- No Phase 10 migration was added solely for indexes because the current query shapes did not justify a safe, evidence-based schema change yet.
- Refresh-session cleanup and resolved-failure cleanup may benefit from future compound indexes if retention volume grows materially; that is a follow-up tuning candidate, not a blocker for this phase.

## Rollback Guidance

- Prefer restore-forward over hand-editing applied migrations.
- If a migration must be reverted, restore from a verified backup and redeploy a compatible application build.

### PostgreSQL 18 To PostgreSQL 16 Local Rollback

Rollback is intended only before accepting PostgreSQL 18-only writes.

1. Stop application writers: API, worker, and web.
2. Stop the PostgreSQL 18 Compose service without deleting volumes.
3. Restore Compose configuration to the PostgreSQL 16 image and reattach the preserved `autonomous-csa_postgres-data` volume at `/var/lib/postgresql/data`.
4. Start PostgreSQL 16.
5. Verify PostgreSQL 16 reports version 16 and selected table counts match the pre-migration source counts.
6. Restart the compatible application stack.

Once new writes occur on PostgreSQL 18, the old PostgreSQL 16 volume becomes stale. Rolling back after that point requires a fresh logical export compatible with PostgreSQL 16, and may not be safe if PostgreSQL 18-only features or incompatible dump output are present. The old volume is a short-term rollback source, not a permanent backup.
