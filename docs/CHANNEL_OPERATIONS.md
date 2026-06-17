# Channel Operations

Operators can manage mock channel connections at `/channels`.

Available API actions:

- `GET /channel-connections`
- `POST /channel-connections`
- `GET /channel-connections/:id`
- `PATCH /channel-connections/:id`
- `POST /channel-connections/:id/disable`
- `POST /channel-connections/:id/enable`
- `POST /channel-connections/:id/test`
- `GET /tickets/:ticketId/conversation`
- `GET /tickets/:ticketId/channel-messages`
- `GET /tickets/:ticketId/outbound-messages`
- `POST /outbound-messages/:id/replay`
- `POST /outbound-messages/:id/cancel`

Operations summary includes pending outbound, retry-scheduled outbound, dead-lettered delivery, and recent channel failures. Replay is RBAC-protected to owner/admin roles and cannot replay sent, delivered, or cancelled messages.

Provider failure modes for mock testing are configured on the connection JSON as `failureMode`: `retryable`, `429`, `503`, `timeout`, `permanent`, `invalid_recipient`, or `malformed`.
