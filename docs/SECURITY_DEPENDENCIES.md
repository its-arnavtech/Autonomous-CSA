# Security Dependency Review

## Implemented

Direct dependency fixes:

- `turbo` updated from `2.8.3` to `2.9.18` to address `GHSA-hcf7-66rw-9f5r` and `GHSA-3qcw-2rhx-2726`.

Transitive lockfile remediations:

- `ajv` pinned to `6.14.0` for the `@eslint/eslintrc` path and `8.18.0` for the Nest CLI path.
- `brace-expansion` pinned to `1.1.13`.
- `js-yaml` pinned to `4.2.0`.
- `@babel/core` pinned to `7.29.6`.

Verification:

- `pnpm audit --audit-level low` returned `No known vulnerabilities found` after the lockfile refresh.

## Deferred

Non-blocking ecosystem drift:

- Deprecated subdependencies remain visible during install for `glob@10.5.0`, `glob@7.2.3`, and `inflight@1.0.6`. These were not returned as active audit findings after the lockfile refresh, so they are tracked for routine dependency maintenance rather than urgent remediation.

## Policy

- Prefer minimal compatible updates over major-version churn.
- Keep direct and transitive fixes documented in the root `pnpm.overrides` block.
- Re-run `pnpm audit --audit-level low` before staging promotion and again before any production cutover.
