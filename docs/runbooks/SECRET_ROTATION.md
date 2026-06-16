# Secret Rotation

Symptoms:

- a secret is expired, exposed, or scheduled for rotation

Checks:

- identify every runtime that consumes the secret
- confirm replacement secret has been generated securely

Safe actions:

- update deployment environment first
- restart affected services in a controlled order
- invalidate dependent sessions if required

Unsafe actions:

- partial rotation where worker and API disagree on signing secrets

Recovery:

- complete rotation
- verify auth, metrics, and provider integrations

Verification:

- health endpoints pass
- login and refresh work as expected

Escalation:

- involve security owner if exposure scope is unknown or customer data may be affected
