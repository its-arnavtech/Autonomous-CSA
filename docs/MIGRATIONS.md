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
