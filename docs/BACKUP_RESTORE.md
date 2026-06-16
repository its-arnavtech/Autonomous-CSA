# Backup And Restore

## Commands

- Root backup: `pnpm db:backup`
- Root restore: `pnpm db:restore <backup-file> --target-database-url=...`
- Root verify: `pnpm db:backup:verify <backup-file>`
- Direct shell wrappers: `./scripts/db-backup.sh`, `.\scripts\db-backup.ps1`, `./scripts/db-restore.sh`, `.\scripts\db-restore.ps1`, `./scripts/db-backup-verify.sh`, `.\scripts\db-backup-verify.ps1`

## Behavior

- Backups use `pg_dump` custom format with compression.
- Each backup writes a `.dump`, `.sha256`, and `.json` metadata file.
- Metadata includes timestamp, app version, git SHA, safe database host, migration count, and checksum.
- Restore verifies checksum before running `pg_restore`.
- Restore refuses production-like targets unless `--allow-production=true` is supplied.
- Verification creates a temporary database, restores the dump, runs Prisma migration status, checks required tables, compares selected row counts, and drops the temp database unless preserve mode is used.

## Environment

- `BACKUP_DIR`
- `BACKUP_RETENTION_DAYS`
- `PG_DUMP_PATH`
- `PG_RESTORE_PATH`
- `PSQL_PATH`
- `TARGET_DATABASE_URL`
- `PG_ADMIN_DATABASE_URL`

## Windows Notes

- If `pg_dump`, `pg_restore`, or `psql` work in a normal Command Prompt but not in the repo PowerShell terminal, set one or more of:
  - `PG_DUMP_PATH`
  - `PG_RESTORE_PATH`
  - `PSQL_PATH`
- These overrides accept absolute paths with spaces, for example a PostgreSQL `bin` directory under `C:\Program Files\...`.
- Missing executable errors now name the missing command and the supported override variable instead of failing with a generic Windows spawn error.

## Operational Guidance

- Backup frequency: at least daily for staging-like environments.
- Retention: keep at least 14 rolling daily backups unless policy requires more.
- Encryption: encrypt backups at rest outside this repo.
- Offsite storage: required for any production-like deployment.
- Restore drill frequency: at least monthly.
- Target RPO: 24 hours or better.
- Target RTO: 60 minutes or better for staging-class recovery.
- Access control: restrict backup and restore execution to operators with database admin access.

## Verification Notes

- The verification helpers now accept `PG_DUMP_PATH`, `PG_RESTORE_PATH`, and `PSQL_PATH` overrides so Windows operators can point at explicit PostgreSQL client binaries instead of relying on `PATH`.
- If PostgreSQL client binaries are only available inside a container or platform package, wrap them with an explicit host-side command path rather than weakening checksum or restore safety checks.

## Current Verification Status

- Automated helper coverage currently verifies checksum generation and mismatch rejection, metadata redaction, restore guard behavior, temporary database name generation, and executable discovery including executable paths with spaces.
- A live `db:backup` and `db:backup:verify` drill still requires a reachable non-production PostgreSQL instance with known credentials from the current terminal session.
