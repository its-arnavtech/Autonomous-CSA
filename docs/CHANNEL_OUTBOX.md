# Channel Outbox

`OutboundMessage` is the transactional outbox for channel delivery.

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
