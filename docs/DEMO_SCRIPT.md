# Demo Script

## Preparation

Prerequisites are Docker Desktop, Node.js 22, pnpm 10.29.1, and free ports 3100-3102, 55432, and 6380. No provider keys or paid services are required.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd demo:reset
pnpm.cmd demo:up
```

`demo:up` is the one-command demonstration after dependencies are installed. It builds production images, creates a fresh database, migrates, seeds, verifies the base stack, runs the signed channel scenario, performs load/failure/backup drills, and prints safe URLs. Generated credentials remain in ignored `run-output/staging-local.env`; the command does not print them.

## Five-Minute Walkthrough

1. Open `http://localhost:3100/login` and explain the Next.js BFF/HttpOnly-cookie boundary.
2. Show `/tickets` and a ticket detail: inbound conversation, timeline, Router/Retriever/Resolver/Critic steps, knowledge source, guardrails, draft, and approval.
3. Show `/channels`: connection identity comes from configuration, not webhook payload fields.
4. Show `/operations`: run status, audit history, delivery attempts, retry/dead-letter visibility, and replay controls.
5. Open `run-output/channel-staging-results.json` and point to exact duplicate, retry, failure, restart, backup/restore, and bounded-load evidence. Do not display `staging-local.env`.

## Talking Points

- PostgreSQL owns durable business truth; BullMQ moves IDs and can be reconstructed.
- Agentic means multi-stage tool-driven decisions with persisted state, critique, guardrails, and approval, not Python or model training.
- Raw-body signatures and unique receipts prevent forged or duplicate ingress.
- Transactional outbound creation plus atomic claims/reconciliation prevents duplicate successful sends.
- The environment is locally production-validated, not production deployed.

## Cleanup

```powershell
pnpm.cmd demo:down
pnpm.cmd demo:reset
```

`demo:down` preserves volumes for another inspection. `demo:reset` removes demo volumes/backups and rotates generated local credentials for the next run.
