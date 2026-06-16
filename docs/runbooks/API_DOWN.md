# API Down

Symptoms:

- `/health/live` or `/health/ready` fails
- login and ticket APIs return 5xx

Checks:

- inspect API container logs
- confirm `DATABASE_URL`, `REDIS_URL`, and JWT secrets are present
- confirm Postgres and Redis connectivity

Safe actions:

- restart API after config validation
- verify migrations and health endpoints

Unsafe actions:

- changing secrets or schema blindly on a live incident path

Recovery:

- restore valid config
- re-run readiness checks

Verification:

- `/health/ready` returns ready
- login and ticket list recover

Escalation:

- involve database or platform owner if Postgres or Redis remain unavailable
