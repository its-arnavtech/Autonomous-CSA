# Worker Stuck

Symptoms:

- queue backlog grows
- agent runs stay queued or running too long

Checks:

- inspect worker logs
- inspect BullMQ queue depth
- inspect operational failures and dead-letter events

Safe actions:

- perform graceful worker restart
- replay only verified failed runs

Unsafe actions:

- force deleting active jobs without understanding side effects

Recovery:

- restore Redis and provider connectivity
- drain backlog with monitored worker restarts

Verification:

- active jobs resume or retry correctly
- queue backlog trends down

Escalation:

- involve application owner if retries produce duplicate customer-facing effects
