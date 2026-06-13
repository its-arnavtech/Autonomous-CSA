# Runbook

This runbook describes the current Phase 1 local development flow.

## Prerequisites

- Node.js compatible with this workspace.
- pnpm `10.29.1` or compatible.
- Docker Desktop or another Docker runtime.
- Ports `3000`, `3001`, `3002`, `5432`, and `6379` available.

## Environment

Use `.env.example` as the local reference:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentic_support
REDIS_HOST=localhost
REDIS_PORT=6379
API_BASE_URL=http://localhost:3001
```

Do not commit real `.env` files.

## Start Infrastructure

```bash
docker compose up -d redis postgres
```

Verify:

```bash
docker compose ps
```

## Install Dependencies

PowerShell may block `pnpm.ps1`; use `pnpm.cmd` if needed.

```bash
pnpm.cmd install
```

## Prepare Database

Generate Prisma Client:

```bash
pnpm.cmd db:generate
```

Apply migrations:

```bash
pnpm.cmd db:migrate
```

Seed demo data:

```bash
pnpm.cmd db:seed
```

The seed creates `Organization.slug = "org_demo"` and one optional sample ticket.

## Run All Apps

```bash
pnpm.cmd dev
```

Expected ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Worker: `http://localhost:3002`
- Swagger: `http://localhost:3001/docs`

## Verify Health

```bash
Invoke-RestMethod http://localhost:3001/health
```

Expected:

```json
{"ok":true}
```

## Create a Ticket

```bash
$body = @{
  orgId = "org_demo"
  subject = "Login issue"
  body = "I cannot log in"
  customerEmail = "customer@example.com"
  customerName = "Demo Customer"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3001/tickets `
  -ContentType "application/json" `
  -Body $body
```

Expected response:

```json
{
  "ticketId": "generated-ticket-id",
  "enqueuedJobId": "bullmq-job-id"
}
```

## Verify Ticket List

```bash
Invoke-RestMethod "http://localhost:3001/tickets?orgId=org_demo"
```

## Verify Ticket Detail

```bash
Invoke-RestMethod "http://localhost:3001/tickets/<ticketId>?orgId=org_demo"
```

Expected: ticket fields plus `messages`.

## Verify Worker Processing

Watch the worker terminal for:

```text
[worker] processing ticket <ticketId> for org org_demo
[worker] subject: <subject>
```

## Verify Timeline API

```bash
Invoke-RestMethod "http://localhost:3001/tickets/<ticketId>/timeline?orgId=org_demo"
```

Expected event types:

- `RUN_QUEUED`
- `RUN_STARTED`
- `ROUTER_DECISION`
- `RUN_FINISHED`

## Verify Next Proxies

Ticket list proxy:

```bash
Invoke-RestMethod "http://localhost:3000/api/tickets?orgId=org_demo"
```

Timeline proxy:

```bash
Invoke-RestMethod "http://localhost:3000/api/tickets/<ticketId>/timeline?orgId=org_demo"
```

## Verify Web UI

Ticket inbox:

```text
http://localhost:3000/tickets?orgId=org_demo
```

Ticket timeline:

```text
http://localhost:3000/tickets/<ticketId>?orgId=org_demo
```

The timeline page should render the Postgres-backed `AgentEvent` rows.

## Build

```bash
pnpm.cmd build
```

## Last Validation Notes

Last validation run: June 13, 2026.

- `docker compose up -d redis postgres` passed.
- `pnpm.cmd install` passed.
- `pnpm.cmd db:generate` passed.
- Initial migration `20260613201721_init` was created and applied.
- `pnpm.cmd db:seed` passed.
- `pnpm.cmd dev` passed after Turbo `globalEnv` was updated for `DATABASE_URL`.
- API health, ticket create/list/detail/timeline, Next proxies, ticket inbox, and ticket timeline UI passed.
- `pnpm.cmd build` passed.

