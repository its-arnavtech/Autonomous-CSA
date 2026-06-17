# Known Limitations

- **Deployment:** locally production-validated only. No production deployment or persistent hosted staging exists; hosted staging is deferred under the zero-spend policy.
- **Channels:** the mock email adapter proves contracts and failure behavior but does not send real email. Gmail, Microsoft, Zendesk, and similar adapters are not implemented.
- **AI providers:** deterministic fallback is the verified default. OpenAI and Anthropic abstractions exist, but the final zero-spend run used no paid credentials and proves no external-provider SLA.
- **Attachments:** sanitized metadata is stored; binary upload, object storage, antivirus scanning, and content extraction are not included.
- **Identity:** first-party email/password auth exists. Invitations, password-reset email, SSO, OAuth/social login, SCIM, MFA, and account recovery are outside v1.0.
- **Tenant isolation:** application guards, scoped queries, constraints, and tests enforce isolation; PostgreSQL row-level security is not enabled.
- **Scale:** measured results are bounded local drills. Multi-region operation, horizontal scaling, capacity planning, soak testing, and production SLOs are not established.
- **Operations:** no managed secret store, hosted log/metric backend, paging integration, or third-party penetration test is configured.
- **Data lifecycle:** cleanup tooling exists, but legal retention, export/deletion workflows, regional residency, and formal compliance certification are not implemented.
- **Product scope:** billing, subscription management, advanced analytics, multilingual UX, and customer-facing portal features are not included.
