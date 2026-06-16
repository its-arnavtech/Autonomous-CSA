# Restore Procedure

Symptoms:

- database recovery or validation is required

Checks:

- verify target database URL
- verify checksum sidecar
- confirm production override intent if needed

Safe actions:

- restore into temporary database first
- run verification before any live cutover

Unsafe actions:

- restoring over production-like data without explicit override and verified backup provenance

Recovery:

- restore
- validate schema and row counts

Verification:

- Prisma migrate status passes
- expected tables and row counts match

Escalation:

- involve database and release owners before any production-like restore
