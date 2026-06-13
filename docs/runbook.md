# Runbook

This runbook describes the current local prototype. It assumes Windows PowerShell from the repository root, but the commands are standard pnpm/Docker commands.

## Prerequisites

- Node.js compatible with the installed dependencies.
- pnpm `10.29.1` or compatible.
- Docker Desktop or another Docker runtime.
- Redis available on `localhost:6379`.

## Local Environment

Current local env files observed:

- Root `.env`: `REDIS_HOST`, `REDIS_PORT`.
- `apps/web/.env.local`: `API_BASE_URL`.

These files are intentionally ignored by Git. A tracked `.env.example` does not exist yet.

Recommended local values:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
API_BASE_URL=http://localhost:3001
```

## Start Redis

```bash
docker compose up -d redis
```

Verify Redis container status:

```bash
docker compose ps
```

## Install Dependencies

```bash
pnpm install
```

## Run All Apps

From the repo root:

```bash
pnpm dev
```

The root `dev` script sets `REDIS_HOST=localhost` and `REDIS_PORT=6379`, then runs `turbo dev`.

Expected default ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Worker: `http://localhost:3002`
- Swagger: `http://localhost:3001/docs`

## Run Apps Individually

API:

```bash
pnpm --filter @apps/api dev
```

Worker:

```bash
pnpm --filter @apps/worker dev
```

Web:

```bash
pnpm --filter @apps/web dev
```

## Test Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"ok":true}
```

## Create a Ticket

```bash
curl -X POST http://localhost:3001/tickets ^
  -H "Content-Type: application/json" ^
  -d "{\"orgId\":\"org_demo\",\"subject\":\"Login issue\",\"body\":\"I cannot log in\",\"customerEmail\":\"customer@example.com\"}"
```

Expected response shape:

```json
{
  "ticketId": "generated-uuid",
  "enqueuedJobId": "bullmq-job-id"
}
```

## Verify Worker Processing

Watch the worker terminal after creating a ticket. The current worker logs:

```text
[worker] processing ticket <ticketId> for org <orgId>
[worker] subject: <subject>
```

The worker writes these timeline event types:

- `RUN_STARTED`
- `ROUTER_DECISION`
- `RUN_FINISHED`

## Verify Timeline API

Use the `ticketId` returned by `POST /tickets`:

```bash
curl "http://localhost:3001/tickets/<ticketId>/timeline?orgId=org_demo"
```

Expected response shape:

```json
[
  {
    "ts": "2026-01-01T00:00:00.000Z",
    "type": "RUN_STARTED",
    "payload": {
      "jobId": "1",
      "subject": "Login issue"
    }
  }
]
```

If the worker has not processed the job yet, the response may be an empty array.

## Verify Next Proxy

Use the `ticketId` returned by `POST /tickets`:

```bash
curl "http://localhost:3000/api/tickets/<ticketId>/timeline?orgId=org_demo"
```

Expected response: the same JSON array returned by the API timeline endpoint. Upstream failures should return a JSON object with an `error` field, not an HTML page.

## Verify Web UI

Open:

```text
http://localhost:3000/tickets/<ticketId>?orgId=org_demo
```

Expected UI behavior:

- Shows ticket id and org id.
- Fetches `/api/tickets/<ticketId>/timeline?orgId=org_demo`.
- The Next proxy forwards to `http://localhost:3001/tickets/<ticketId>/timeline?orgId=org_demo`.
- Renders timeline events.
- Shows "No events yet" only when the returned JSON array is empty.
- Shows a timeline error panel if the proxy/API fails or returns malformed JSON.

## Phase 0 Completion Checklist

- [x] Redis runs via `docker compose up -d redis`.
- [x] Web/API/worker run together via `pnpm dev`.
- [x] `GET http://localhost:3001/health` returns `{ "ok": true }`.
- [x] `POST http://localhost:3001/tickets` returns `{ ticketId, enqueuedJobId }`.
- [x] Worker processes `ticket.process`.
- [x] `GET http://localhost:3001/tickets/<ticketId>/timeline?orgId=org_demo` returns timeline events.
- [x] `GET http://localhost:3000/api/tickets/<ticketId>/timeline?orgId=org_demo` returns timeline events as JSON.
- [x] `http://localhost:3000/tickets/<ticketId>?orgId=org_demo` renders timeline events.
- [ ] Git status is clean except expected source/doc changes.

## Last Validation Notes

Last validation run: June 13, 2026.

- `pnpm.cmd install` succeeded after `pnpm install` was blocked by PowerShell execution policy.
- `docker compose up -d redis` initially failed while Docker Desktop was unavailable, then succeeded after retry.
- `pnpm dev` started web/API/worker; API and worker compiled with 0 errors, and Next became ready.
- API route logs confirmed `Mapped {/tickets, POST}` and `Mapped {/tickets/:id/timeline, GET}`.
- `GET http://127.0.0.1:3001/health` returned `{"ok":true}`.
- `POST /tickets` returned ticket id `9e31cd83-990b-4a57-9ad1-96e058614796` and BullMQ job id `1`.
- The worker processed `ticket.process` and wrote `RUN_STARTED`, `ROUTER_DECISION`, and `RUN_FINISHED`.
- The API timeline endpoint returned all 3 events.
- The Next proxy returned all 3 events as JSON.
- The ticket page rendered all 3 timeline events in the browser.
- `pnpm.cmd build` succeeded across the monorepo.

## Other Useful Commands

Build all apps:

```bash
pnpm build
```

Lint all apps:

```bash
pnpm lint
```

Run tests:

```bash
pnpm test
```

Note: current tests are starter tests and do not cover the ticket/queue/timeline path.
