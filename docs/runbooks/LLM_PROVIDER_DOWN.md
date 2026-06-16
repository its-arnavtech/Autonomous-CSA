# LLM Provider Down

Symptoms:

- agent steps fail on provider timeout, 429, or 503
- retries or fallback counts increase

Checks:

- inspect worker logs and queue retry classification
- confirm `AI_PROVIDER`, `AI_API_KEY`, and fallback settings

Safe actions:

- rely on deterministic fallback when configured
- reduce traffic or pause replays if provider is unstable

Unsafe actions:

- rotating providers without validating model compatibility

Recovery:

- restore provider access or keep deterministic fallback active

Verification:

- new runs complete without repeated provider failures

Escalation:

- involve application owner if fallback quality is insufficient for current workload
