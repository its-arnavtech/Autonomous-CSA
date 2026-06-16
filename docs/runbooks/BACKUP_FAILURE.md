# Backup Failure

Symptoms:

- backup script exits non-zero
- checksum or metadata file missing

Checks:

- confirm `pg_dump` path
- confirm `DATABASE_URL`
- confirm backup directory write access

Safe actions:

- fix credentials or filesystem access
- rerun backup and verification

Unsafe actions:

- marking backup complete without checksum and restore verification

Recovery:

- rerun backup
- run restore verification immediately

Verification:

- dump, checksum, and metadata files all exist
- verify script succeeds

Escalation:

- involve database owner if backup consistently fails against a healthy source database
