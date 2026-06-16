# Load Testing

## Tooling

- Primary tool: `k6`
- Script: [scripts/load/k6-smoke.js](/C:/Autonomous-CSA/scripts/load/k6-smoke.js)

## Covered Flows

- Login
- Refresh token rotation
- Ticket listing
- Ticket creation
- Ticket detail
- Operations summary
- Knowledge search

## Environment

- `BASE_URL`
- `LOGIN_EMAIL`
- `LOGIN_PASSWORD`
- `VUS`
- `DURATION`
- `TICKET_ID`
- `INCLUDE_CREATE_TICKET`
- `INCLUDE_REFRESH`
- `CREATE_TICKET_CUSTOMER_EMAIL`

## Expectations

- Safe defaults target local or staging-like environments only.
- Do not use production credentials.
- Record request rate, p50, p95, p99, and error rate from the k6 output.
- Track queue lag and agent completion latency from the app metrics endpoints during the run.
- Use the tenant returned by `/api/auth/login`; do not hardcode production tenant IDs.

## Example

```bash
pnpm load:smoke
```

If `k6` is not installed on the host, a containerized fallback is acceptable:

```bash
docker run --rm -i -v "$PWD:/work" -w /work grafana/k6 run scripts/load/k6-smoke.js
```

## Current Verification Status

- Script syntax validated locally.
- A full latency benchmark still requires a running API plus a local or containerized `k6` binary.
- No live `k6` run was completed in the current terminal session because `k6` is not installed on the host and Docker Desktop was not running for the documented container fallback.
- Treat p95, p99, queue lag, and completion-time thresholds as staging verification work, not as already-proven production capacity.
