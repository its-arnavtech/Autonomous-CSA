# Channel Webhook Security

Webhook organization resolution is based only on `ChannelConnection.publicId`. Payload organization ids, ticket ids, and customer-supplied routing hints are ignored.

The mock provider signs the exact raw JSON request bytes with HMAC-SHA256 and sends it as `x-channel-signature: v1=<hex>`. Verification uses timing-safe comparison. Invalid signatures are rejected with `403` and recorded as rejected receipts when the connection is known.

Controls:

- Payload size is bounded by `CHANNEL_WEBHOOK_PAYLOAD_LIMIT_BYTES`.
- Non-JSON webhook content types are rejected.
- HTML is sanitized before display.
- Filenames are stripped to safe metadata names.
- Attachments are metadata-only and are not downloaded.
- Duplicate event ids return success without duplicate side effects.
- Provider secrets, raw bodies, access tokens, refresh tokens, database URLs, and Redis URLs must not be logged.

Verified tests cover exact raw-body signature success, whitespace-altered payload rejection, field-order change rejection, invalid signatures, missing signatures, missing raw-body protection, and non-JSON content-type rejection.

Limitation: only the deterministic mock signing scheme is implemented. Do not claim support for a real provider until that provider's timestamp, replay-window, header canonicalization, and raw-byte signing rules are implemented and tested.
