# Secret Hygiene

## Required Secrets

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `METRICS_AUTH_TOKEN` for production-like metrics exposure
- `AI_API_KEY` when `AI_PROVIDER` is `openai` or `anthropic`

## Rules

- Never commit `.env`, API keys, backup archives, or restored database artifacts.
- Production-like placeholder secrets are rejected by runtime validation.
- Avoid logging raw tokens, cookies, database URLs, and provider keys.
- Prefer `REDIS_URL` and `DATABASE_URL` via environment injection rather than Docker build args.

## Rotation

- Generate a new secret.
- Update the secret in the deployment environment.
- Restart API and worker in a controlled window.
- Invalidate dependent sessions if the rotated secret signs active auth tokens.
- Confirm health, auth, and metrics access after rollout.

## Incident Response

- Revoke exposed credentials immediately.
- Rotate any dependent signing or provider keys.
- Review recent logs, CI output, and shell history for further exposure.
- Re-run audit and secret scanning before resuming normal releases.

## Current Findings

- No committed `.env` file was added as part of Phase 10.
- Backup artifacts, dump checksums, and metadata files are ignored by `.gitignore`.
- Runtime validation blocks placeholder JWT secrets in production-like environments.
- Remaining secret-scan confidence still depends on CI execution of Gitleaks and Semgrep in GitHub Actions.
