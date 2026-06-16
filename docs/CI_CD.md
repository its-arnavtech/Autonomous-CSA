# CI/CD and Security Checks

This repository uses GitHub Actions for continuous integration, migration validation, security scanning, Docker build readiness, and scheduled static analysis. The current setup is intentionally deterministic and does not require live AI provider credentials.

## Workflows

### `ci.yml`

Runs on pushes to `main` and pull requests targeting `main`.

- `quality`: installs dependencies, generates the Prisma client, then runs lint, typecheck, test, and build.
- `prisma`: starts PostgreSQL 18 on the Linux runner, applies Prisma migrations with `migrate deploy`, regenerates the client, validates the schema, and runs `pnpm db:migrate:check` for heuristic migration safety review.
- `security`: runs `pnpm audit --audit-level high`, validates backup and staging shell syntax, scans the repo with Gitleaks, and runs Semgrep with TypeScript, Node.js, and React rules.
- `docker`: builds the API, worker, and web Docker images with `push: false` to verify Docker readiness without publishing artifacts.

### `codeql.yml`

Runs CodeQL for JavaScript/TypeScript on pushes to `main`, pull requests targeting `main`, and every Monday.

### `dependabot.yml`

Creates weekly dependency update PRs for npm/pnpm dependencies and GitHub Actions. Minor and patch updates are grouped to reduce PR noise.

## Required secrets

- No AI provider API keys are required in CI.
- `GITHUB_TOKEN` is the only workflow token used directly, and GitHub Actions provides it automatically.
- Future deployment workflows can add deployment secrets separately when production delivery is introduced.

## Why AI keys are not needed

CI runs with deterministic placeholders:

- `AI_PROVIDER=deterministic`
- `AI_API_KEY=ci-placeholder`
- `AI_ENABLE_FALLBACK=true`

That keeps CI deterministic, avoids external model calls, and remains compatible with the new auth phase.

## Auth-related CI environment

CI now also needs safe non-production auth values so auth tests and web builds can run without using real secrets:

- `API_BASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_REFRESH_TTL`

These values should be safe placeholders in GitHub Actions and must not be production credentials. Real production secrets should be injected separately by the deployment environment.

## Local equivalent commands

Run the same checks locally with:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate:deploy
pnpm db:migrate:check
pnpm db:validate
pnpm ci:security
pnpm ci:docker
```

If local Docker or Postgres is unavailable, use `docker compose up -d postgres redis` first or run the non-container checks independently.

Local Compose uses PostgreSQL 18 with a new `postgres-data-v18` volume mounted at `/var/lib/postgresql`. Do not point PostgreSQL 18 at the old PostgreSQL 16 `/var/lib/postgresql/data` volume.

## Handling audit failures

- `pnpm audit --audit-level high` fails only for high and critical findings.
- Upgrade the direct dependency first when possible.
- If the issue is transitive, use an override or wait for the upstream package, then document the temporary exception in the pull request.
- Re-run `pnpm audit --audit-level high` before merging.

## Handling Prisma migration failures

- Confirm `DATABASE_URL` points to a reachable PostgreSQL database.
- Run `pnpm db:migrate:deploy` locally against the same migration set.
- If a migration is broken, fix the migration files or create a forward-only corrective migration instead of rewriting production history.
- Re-run `pnpm db:generate` and `pnpm db:validate` after any schema change.

## Handling Gitleaks false positives

- Review the reported path and confirm whether it is a real secret.
- Replace any real secret with a placeholder and rotate the credential outside the repo.
- If the result is a safe false positive, add a narrowly scoped allow rule in a future `.gitleaks.toml` rather than disabling scanning broadly.

## Future deployment plan

The current workflows stop at verification. A later deployment phase can add:

- image publishing
- environment-scoped secrets
- preview or staging promotion
- Fly.io release jobs
- migration gating before deploy

That future phase should stay separate from the current CI foundation so quality and security checks remain fast and deterministic.
