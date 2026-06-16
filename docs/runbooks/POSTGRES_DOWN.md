# Postgres Down

Symptoms:

- readiness fails on Postgres
- auth, tickets, and operations pages fail

Checks:

- confirm database host reachability
- confirm credentials and database name
- inspect migration history and recent schema changes

Safe actions:

- restore database availability
- verify connection pool recovery

Unsafe actions:

- applying ad hoc schema edits during outage response

Recovery:

- recover Postgres
- run migration status
- restore from verified backup if needed

Verification:

- `/health/ready` shows Postgres up
- ticket and auth flows succeed

Escalation:

- involve database owner for failover, restore, or corruption events
