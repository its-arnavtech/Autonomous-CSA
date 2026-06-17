# Channel Outbox

`OutboundMessage` is the transactional outbox for channel delivery.

`InboundDispatch` is the transactional outbox for inbound support-run dispatch.

Approval behavior:

- Only `APPROVED` drafts can create channel outbound rows.
- Rejected drafts do not create outbound rows.
- Blocked agent run drafts are rejected before delivery creation.
- The idempotency key is `draft:<draftId>:channel-send:v1`.
- Repeated approval cannot create a duplicate outbound message because `idempotencyKey` is unique.

Worker behavior:

- BullMQ jobs contain only `outboundMessageId`.
- The worker loads message state from Postgres.
- A lease is recorded with `leaseOwner` and `leaseExpiresAt`.
- Terminal statuses `SENT`, `DELIVERED`, `CANCELLED`, and `DEAD_LETTER` are never resent.
- Retryable failures become `RETRY_SCHEDULED`.
- Permanent or exhausted failures become `DEAD_LETTER` and create `OperationalFailure`.

Postgres is the source of truth. Redis is wake-up infrastructure.

Inbound dispatch behavior:

- The webhook transaction creates `InboundDispatch` with idempotency key `inbound-run:<runId>:support:v1`.
- The row stores the exact worker payload needed for deterministic recovery.
- The reconciler claims rows with `lockOwner` and `lockExpiresAt`.
- Successful BullMQ enqueue marks the row `COMPLETED`.
- Redis enqueue failure returns the row to `PENDING` with a retry delay.
- Repeated reconciliation uses deterministic BullMQ job ids and does not create duplicate logical jobs.
