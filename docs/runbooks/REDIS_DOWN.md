# Redis Down

Symptoms:

- queue enqueue or worker consumption fails
- general API rate limiting may degrade open
- auth rate limiting may fail closed

Checks:

- confirm Redis process health
- confirm `REDIS_URL` or host and port settings
- inspect API and worker readiness payloads

Safe actions:

- restore Redis availability
- restart API and worker only after Redis is healthy

Unsafe actions:

- switching queue prefixes or deleting keys during incident response

Recovery:

- return Redis connectivity
- verify queue and rate-limit behavior

Verification:

- `/health/ready` shows Redis up
- worker processes new jobs

Escalation:

- involve infrastructure owner if Redis data loss or repeated reconnect storms occur
