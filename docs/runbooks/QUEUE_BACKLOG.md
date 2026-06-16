# Queue Backlog

Symptoms:

- queued agent runs climb
- operations dashboard shows unresolved failures

Checks:

- inspect queue depth
- inspect worker health
- inspect Redis latency and worker shutdown events

Safe actions:

- scale worker capacity in staging-like environments
- replay only resolved failure cases

Unsafe actions:

- bulk clearing queue state without preserving failure context

Recovery:

- clear root cause
- let workers drain backlog naturally

Verification:

- queued and running counts trend back to baseline

Escalation:

- involve platform or application owner if backlog threatens SLA or customer response time
