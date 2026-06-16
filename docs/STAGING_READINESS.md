# Staging Readiness

## Script

- PowerShell: `.\scripts\staging-readiness.ps1`
- Bash: `./scripts/staging-readiness.sh`

## Checks

- Required env vars exist
- JWT secrets are not placeholders
- Redis configuration exists
- CORS is not wildcard
- Backup directory is writable
- Version and git SHA are set

## Manual Follow-Up

- Confirm `pnpm db:migrate:deploy` succeeds against the staging database.
- Confirm `/health/ready` succeeds for API and worker.
- Confirm metrics auth, Swagger exposure, rate limiting, and backup settings match the target environment.
- Confirm deterministic fallback or provider API keys are explicitly configured for the worker.
- Confirm a verified restore drill has been completed with the same PostgreSQL client tooling that staging operators will use.
