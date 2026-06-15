# Queue Failures

Phase 9 hardens BullMQ handling for support jobs.

## Defaults

- finite attempts via `QUEUE_JOB_ATTEMPTS`
- exponential backoff via `QUEUE_BACKOFF_BASE_MS`
- bounded complete and fail retention
- dedicated dead-letter queue: `support-dead-letter`

## Persistent failure record

When a failure exhausts retries or is classified as non-retryable, the worker writes an `OperationalFailure` row with:

- queue name
- job name and job ID
- tenant, ticket, run, and correlation references when known
- safe error code and message
- attempt count
- sanitized payload summary

## Idempotency protections

- terminal runs are not reprocessed once already succeeded or blocked
- worker-created drafts are reused per run instead of duplicated
- worker-created approvals are reused per run/draft instead of duplicated
- replay creates a fresh run and fresh trusted job ID
