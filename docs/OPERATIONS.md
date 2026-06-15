# Operations

Phase 9 adds a tenant-scoped operations surface in both the API and the web app.

## API routes

- `GET /operations/summary`
- `GET /operations/runs`
- `GET /operations/runs/:id`
- `GET /operations/failures`
- `GET /operations/failures/:id`
- `POST /operations/failures/:id/replay`
- `PATCH /operations/failures/:id/resolve`
- `GET /operations/audit`
- `GET /operations/audit/export`

## Permissions

- Read routes: all tenant members
- Replay and resolve: `OWNER` and `ADMIN`
- Cross-tenant lookups return safe `404` responses

## Web UI

The authenticated `/operations` page shows:

- summary cards
- recent runs
- recent failures
- audit search
- CSV export
- replay and resolve controls for owner/admin roles

## Replay behavior

Replay uses the current trusted ticket state, creates a fresh `AgentRun`, enqueues a new trusted BullMQ job, and records the replayed job ID on the original `OperationalFailure`.
