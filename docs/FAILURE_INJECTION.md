# Failure Injection

## Verified

- Invalid runtime configuration fails fast through automated config validation tests and manual staging-readiness execution.
- Redis rate-limit degradation paths are covered by automated tests:
  - auth rate limiting fails closed with a `503`
  - general API rate limiting fails open so normal reads are not blocked by limiter degradation
- Restore checksum mismatches are rejected by the backup helper tests.

## Partially Verified

- Staging readiness was exercised with safe placeholder values and passed.
- Manual Docker image builds succeeded, which reduced risk around container startup and signal handling, but did not replace full outage drills.
- Live Redis, Postgres, and worker-shutdown outage drills were not completed in the current terminal session because the expected local stack was not available end to end.

## Still Required In A Staging Drill

- Redis outage against a live API and worker
- Postgres outage against a live API and worker
- Worker shutdown in the middle of a real long-running job
- API shutdown during an actively in-flight request
- Backup destination unavailable during a real dump operation
- LLM provider timeout, `429`, and `503` behavior against the worker runtime

## Why These Remain Deferred

- The current local environment does not include host PostgreSQL client binaries or `k6`, so the repo-side safety checks can be validated here more easily than the full staging-shaped outage drills.
- Those live drills should be run where operators can use the exact PostgreSQL client binaries, scheduler, and network topology intended for staging.
