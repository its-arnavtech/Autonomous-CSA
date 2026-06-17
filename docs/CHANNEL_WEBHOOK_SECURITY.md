# Channel Webhook Security

Webhook organization resolution is based only on `ChannelConnection.publicId`. Payload organization ids, ticket ids, and customer-supplied routing hints are ignored.

The mock provider signs the canonical JSON payload with HMAC-SHA256 and sends it as `x-channel-signature: v1=<hex>`. Verification uses timing-safe comparison. Invalid signatures are rejected with `403` and recorded as rejected receipts when the connection is known.

Controls:

- Payload size is bounded by `CHANNEL_WEBHOOK_PAYLOAD_LIMIT_BYTES`.
- HTML is sanitized before display.
- Filenames are stripped to safe metadata names.
- Attachments are metadata-only and are not downloaded.
- Duplicate event ids return success without duplicate side effects.
- Provider secrets, raw bodies, access tokens, refresh tokens, database URLs, and Redis URLs must not be logged.

Limitation: the current mock signature scheme signs canonical JSON instead of raw bytes. A real provider that requires raw-body verification must add Express raw-body capture before production use.
