# Channel Testing

No external provider is required.

Simulator commands:

- `pnpm channel:mock:inbound`
- `pnpm channel:mock:duplicate`
- `pnpm channel:mock:invalid-signature`
- `pnpm channel:mock:reply`
- `pnpm channel:mock:delivery`
- `pnpm channel:verify`

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

Implemented unit coverage currently verifies raw-body signing, invalid signatures, content-type rejection, sanitizer behavior, deterministic mock outbound ids, inbound dispatch success, inbound dispatch retry after Redis enqueue failure, and claim collision handling.

Production-image E2E, backup/restore, bounded load, callback-ordering E2E, and restart drills are still required before declaring Phase 12 complete.
