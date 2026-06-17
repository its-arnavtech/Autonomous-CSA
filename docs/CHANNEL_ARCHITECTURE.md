# Channel Architecture

Phase 12 adds a tenant-scoped support-channel foundation for external customer messages.

Flow:

1. A provider sends a signed webhook to `POST /webhooks/channels/:connectionPublicId`.
2. The API resolves the channel connection by public id and derives the organization from that record only.
3. The provider adapter verifies the signature and parses a normalized event.
4. `WebhookReceipt` is created before side effects. The unique `(channelConnectionId, providerEventId)` constraint is the final idempotency authority.
5. Inbound events match or create `ExternalCustomer`, `Conversation`, `ExternalMessage`, `Ticket`, `TicketMessage`, `AgentRun`, and timeline events in one transaction.
6. The existing support worker is woken with a deterministic `support-:runId` job.
7. Approval creates one `OutboundMessage` using `draft:<draftId>:channel-send:v1`.
8. The `channel-delivery` worker claims outbound rows, calls the provider adapter, records `DeliveryAttempt`, and updates timeline state.

All channel tables include an organization column. Webhook payloads cannot choose organization or ticket directly.
