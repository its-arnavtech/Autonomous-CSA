# Channel Testing

No external provider is required.

Simulator commands:

- `pnpm channel:mock:inbound`
- `pnpm channel:mock:duplicate`
- `pnpm channel:mock:invalid-signature`
- `pnpm channel:mock:reply`
- `pnpm channel:mock:delivery`
- `pnpm channel:verify`
- `pnpm channel:staging:verify`

Required environment:

- `API_BASE_URL`
- `CHANNEL_CONNECTION_PUBLIC_ID`
- `MOCK_CHANNEL_WEBHOOK_SECRET`

Recommended checks:

1. Create a mock channel in `/channels`.
2. Export `CHANNEL_CONNECTION_PUBLIC_ID` from the safe connection response.
3. Run `pnpm channel:mock:inbound`.
4. Confirm receipt, customer, conversation, external message, ticket, run, and inbound dispatch records.
5. Approve the created draft.
6. Confirm one outbound message and delivery attempt.
7. Run duplicate and invalid-signature commands.

Implemented coverage verifies raw-body signing, invalid signatures, content-type rejection, sanitizer behavior, deterministic mock outbound ids, inbound dispatch success, inbound dispatch retry after Redis enqueue failure, outbound delivery reconciliation, replay enqueue ids, and claim collision handling.

`pnpm channel:staging:verify` runs the production-image Phase 12 gate against the local staging stack. The passing June 17, 2026 run verified exact raw-body signatures, duplicate suppression, inbound dispatch durability, approval-to-outbound delivery, callback ordering, retryable and permanent failures, replay RBAC, Redis/Postgres/restart drills, bounded channel load, backup/restore row-count parity, and tenant/security checks. The result is written to `run-output/channel-staging-results.json`.
