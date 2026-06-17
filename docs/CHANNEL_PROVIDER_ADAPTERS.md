# Channel Provider Adapters

The provider contract is defined in `apps/api/src/channels/channel-provider.interface.ts`.

Current adapter:

- `MOCK_EMAIL`: deterministic email-like provider for local and automated verification.

The adapter supports signed webhook verification, inbound message parsing, delivery callback parsing, outbound send success, retryable failure, permanent failure, timeout, malformed response, deterministic provider message ids, and metadata-only attachments.

Real providers must keep SDK types inside adapter modules and must not become required for tests. Provider secrets are stored as non-returned connection fields and are redacted from normal API responses.
