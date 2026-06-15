# Phase 8: Auth and Tenancy Closeout

## 1. Files changed

- Database and seed:
  `packages/db/prisma/schema.prisma`,
  `packages/db/prisma/migrations/20260614130000_phase8_auth_tenancy/migration.sql`,
  `packages/db/prisma/seed.ts`,
  `packages/db/src/index.ts`
- API auth module:
  `apps/api/src/auth/auth.module.ts`,
  `apps/api/src/auth/auth.controller.ts`,
  `apps/api/src/auth/auth.dto.ts`,
  `apps/api/src/auth/auth.service.ts`,
  `apps/api/src/auth/auth.service.spec.ts`,
  `apps/api/src/auth/authenticated-user.type.ts`,
  `apps/api/src/auth/current-organization.decorator.ts`,
  `apps/api/src/auth/current-user.decorator.ts`,
  `apps/api/src/auth/jwt-access.guard.ts`,
  `apps/api/src/auth/organization-role.constants.ts`,
  `apps/api/src/auth/password.service.ts`,
  `apps/api/src/auth/roles.decorator.ts`,
  `apps/api/src/auth/roles.guard.ts`,
  `apps/api/src/auth/tenant-context.guard.ts`,
  `apps/api/src/auth/token.service.ts`,
  `apps/api/src/auth/actor-type.constants.ts`
- API module/bootstrap/runtime changes:
  `apps/api/package.json`,
  `apps/api/src/app.module.ts`,
  `apps/api/src/main.ts`
- API tenant and RBAC enforcement:
  `apps/api/src/tickets/tickets.controller.ts`,
  `apps/api/src/tickets/tickets.timeline.controller.ts`,
  `apps/api/src/tickets/tickets.dto.ts`,
  `apps/api/src/drafts/drafts.controller.ts`,
  `apps/api/src/drafts/drafts.dto.ts`,
  `apps/api/src/approvals/approvals.controller.ts`,
  `apps/api/src/approvals/approvals.dto.ts`,
  `apps/api/src/orgs/orgs.controller.ts`,
  `apps/api/src/knowledge/knowledge.controller.ts`,
  `apps/api/src/knowledge/knowledge.dto.ts`,
  `apps/api/src/knowledge/knowledge.service.ts`,
  `apps/api/src/queue/queue.controller.ts`,
  `apps/api/src/support/support.service.ts`
- API tests updated for Phase 8 behavior:
  `apps/api/src/approvals/approvals.controller.spec.ts`,
  `apps/api/src/knowledge/knowledge.service.spec.ts`,
  `apps/api/src/support/support.service.spec.ts`
- Web auth shell, protected pages, and auth route handlers:
  `apps/web/src/app/page.tsx`,
  `apps/web/src/app/login/page.tsx`,
  `apps/web/src/app/login/login-form.tsx`,
  `apps/web/src/app/register/page.tsx`,
  `apps/web/src/app/register/register-form.tsx`,
  `apps/web/src/app/_auth/app-shell.tsx`,
  `apps/web/src/app/_auth/auth-client-controls.tsx`,
  `apps/web/src/app/_auth/organization-selection.tsx`,
  `apps/web/src/app/_auth/server-auth.ts`,
  `apps/web/src/app/api/auth/register/route.ts`,
  `apps/web/src/app/api/auth/login/route.ts`,
  `apps/web/src/app/api/auth/refresh/route.ts`,
  `apps/web/src/app/api/auth/logout/route.ts`,
  `apps/web/src/app/api/auth/me/route.ts`,
  `apps/web/src/app/api/auth/organization/route.ts`
- Web proxy updates for tenant-aware protected resources:
  `apps/web/src/app/api/_utils/proxy.ts`,
  `apps/web/src/app/api/tickets/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/timeline/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/approvals/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/drafts/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/agent-steps/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/guardrails/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/priority/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/retrievals/route.ts`,
  `apps/web/src/app/api/tickets/[ticketId]/status/route.ts`,
  `apps/web/src/app/api/drafts/[draftId]/route.ts`,
  `apps/web/src/app/api/drafts/[draftId]/send/route.ts`,
  `apps/web/src/app/api/approvals/[approvalId]/route.ts`,
  `apps/web/src/app/api/knowledge/articles/route.ts`,
  `apps/web/src/app/api/knowledge/articles/[articleId]/route.ts`,
  `apps/web/src/app/api/knowledge/search/route.ts`,
  `apps/web/src/app/api/orgs/settings/route.ts`,
  `apps/web/src/app/api/orgs/[orgId]/settings/route.ts`
- Web protected page updates:
  `apps/web/src/app/tickets/page.tsx`,
  `apps/web/src/app/tickets/[ticketId]/page.tsx`,
  `apps/web/src/app/tickets/[ticketId]/approval-review-card.tsx`,
  `apps/web/src/app/tickets/[ticketId]/draft-card.tsx`,
  `apps/web/src/app/tickets/[ticketId]/draft-composer.tsx`,
  `apps/web/src/app/tickets/[ticketId]/ticket-controls.tsx`,
  `apps/web/src/app/knowledge/page.tsx`,
  `apps/web/src/app/knowledge/knowledge-manager.tsx`,
  `apps/web/src/app/settings/page.tsx`,
  `apps/web/src/app/settings/settings-form.tsx`
- Worker and worker tests:
  `apps/worker/src/support.processor.ts`,
  `apps/worker/src/support.processor.spec.ts`
- Docs, env, and workflow updates:
  `.env.example`,
  `.github/workflows/ci.yml`,
  `pnpm-lock.yaml`,
  `README.md`,
  `docs/AUTH.md`,
  `docs/CI_CD.md`,
  `docs/status.md`,
  `docs/architecture.md`

## 2. Prisma models/enums/migrations

- Added Prisma models:
  `User`,
  `OrganizationMembership`,
  `RefreshSession`
- Added Prisma enums:
  `OrganizationRole`,
  `ActorType`
- Extended existing models:
  `Organization.memberships`,
  `User.memberships`,
  `User.refreshSessions`,
  `HumanApproval.reviewedByUserId`,
  `OutboundDraft.createdByType`,
  `OutboundDraft.createdByUserId`,
  `OutboundDraft.approvedByType`,
  `OutboundDraft.approvedByUserId`,
  `OutboundDraft.sentBy`,
  `OutboundDraft.sentByType`,
  `OutboundDraft.sentByUserId`
- Migration filename:
  `packages/db/prisma/migrations/20260614130000_phase8_auth_tenancy/migration.sql`
- Existing organization ids were preserved. Phase 8 did not rewrite historical `Organization.id` values, tickets, runs, or events.

## 3. Authentication architecture

- The NestJS API is the authentication authority.
- Password hashing uses `argon2` through `apps/api/src/auth/password.service.ts`.
- Access tokens are HMAC-signed JWTs created by `TokenService.createAccessToken(...)`.
- Refresh tokens are HMAC-signed JWTs created by `TokenService.createRefreshToken(...)`.
- Refresh token rows are stored in Postgres as hashed values through `RefreshSession.tokenHash`.
- Refresh rotation revokes the previous session row and creates a new one in `AuthService.refresh(...)`.
- Login rate limiting is implemented in `AuthService` with an in-memory failure counter keyed by email and IP.
- Production-safety checks for secrets and token TTL parsing live in `apps/api/src/auth/token.service.ts`.
- Nest auth endpoints added:
  `POST /auth/register`,
  `POST /auth/login`,
  `POST /auth/refresh`,
  `POST /auth/logout`,
  `GET /auth/me`
- Swagger bearer auth is enabled through `.addBearerAuth()` in `apps/api/src/main.ts`.

## 4. Tenant-selection and enforcement strategy

- The verified tenant header is `X-Organization-Id`.
- The browser-side selected organization cookie is `au_organization_id`.
- The auth cookies are:
  `au_access_token`,
  `au_refresh_token`,
  `au_organization_id`
- Next.js route handlers read HttpOnly cookies server-side and forward:
  `Authorization: Bearer <access token>`
  and
  `X-Organization-Id: <selected organization id>`
- `TenantContextGuard` resolves membership from the authenticated user id plus `X-Organization-Id`.
- Missing tenant header returns `400` with `Missing X-Organization-Id header`.
- Unauthenticated requests return `401`.
- Authenticated non-members return `403`.
- Record lookup remains organization-scoped in service queries as defense in depth.
- Request-provided `orgId` or org slug values are no longer authoritative. Controllers and services now use verified tenant context instead.

## 5. RBAC permission matrix

| Role | Read tickets/drafts/approvals/knowledge/settings | Mutate tickets | Edit drafts | Approve/reject/send drafts | Update organization settings | Manage knowledge |
| --- | --- | --- | --- | --- | --- | --- |
| `OWNER` | Yes | Yes | Yes | Yes | Yes | Yes |
| `ADMIN` | Yes | Yes | Yes | Yes | Yes | Yes |
| `AGENT` | Yes | Yes | Yes | Yes | No | No |
| `VIEWER` | Yes | No | No | No | No | No |

- Role constants:
  `READ_ORG_ROLES = OWNER, ADMIN, AGENT, VIEWER`
  `MUTATING_ORG_ROLES = OWNER, ADMIN, AGENT`
  `MANAGE_ORG_ROLES = OWNER, ADMIN`
- Enforcement is centralized through `@Roles(...)` plus `RolesGuard`.

## 6. API endpoints added/changed

- Public auth endpoints added:
  `POST /auth/register`,
  `POST /auth/login`,
  `POST /auth/refresh`,
  `POST /auth/logout`
- Authenticated profile endpoint added:
  `GET /auth/me`
- Protected ticket endpoints:
  `GET /tickets`,
  `GET /tickets/:id`,
  `GET /tickets/:id/timeline`,
  `GET /tickets/:id/approvals`,
  `GET /tickets/:id/drafts`,
  `GET /tickets/:id/agent-steps`,
  `GET /tickets/:id/guardrails`,
  `GET /tickets/:id/retrievals`,
  `POST /tickets`,
  `PATCH /tickets/:id/status`,
  `PATCH /tickets/:id/priority`,
  `POST /tickets/:id/drafts`
- Protected draft endpoints:
  `GET /drafts/:id`,
  `PATCH /drafts/:id`,
  `POST /drafts/:id/send`
- Protected approval endpoints:
  `POST /approvals`,
  `PATCH /approvals/:id`
- Protected organization settings endpoints:
  `GET /orgs/settings`,
  `PATCH /orgs/settings`
- Protected knowledge endpoints:
  `POST /knowledge/articles`,
  `GET /knowledge/articles`,
  `GET /knowledge/articles/:id`,
  `PATCH /knowledge/articles/:id`,
  `DELETE /knowledge/articles/:id`,
  `POST /knowledge/search`
- Debug queue endpoint:
  `POST /debug/queue/hello`
  is now protected by authenticated tenant and role guards instead of being effectively open.
- `GET /health` remains public.
- Swagger remains configurable via `SWAGGER_ENABLED`.

## 7. Web pages/components/proxy changes

- New browser-facing auth pages:
  `/login`,
  `/register`
- Protected app pages now require server-side session resolution:
  `/tickets`,
  `/tickets/[ticketId]`,
  `/knowledge`,
  `/settings`
- New shared auth shell/components:
  `apps/web/src/app/_auth/app-shell.tsx`,
  `apps/web/src/app/_auth/auth-client-controls.tsx`,
  `apps/web/src/app/_auth/organization-selection.tsx`,
  `apps/web/src/app/_auth/server-auth.ts`
- New browser-facing auth route handlers:
  `POST /api/auth/register`,
  `POST /api/auth/login`,
  `POST /api/auth/refresh`,
  `POST /api/auth/logout`,
  `GET /api/auth/me`,
  `POST /api/auth/organization`
- Proxy helper behavior in `apps/web/src/app/api/_utils/proxy.ts`:
  stores tokens in HttpOnly cookies,
  forwards bearer auth server-side,
  forwards `x-organization-id`,
  supports refresh on `401`,
  clears cookies on logout or failed refresh,
  trims `API_BASE_URL` and strips trailing slashes
- Selected organization defaults to the first membership on login/register through `setAuthCookies(...)`, and can be switched only after validating membership in `POST /api/auth/organization`.

## 8. Worker/queue changes

- The API now enqueues `ticket.process` jobs using the verified internal organization id rather than trusting caller-supplied org identifiers.
- `TicketProcessJob` now includes:
  `orgId`,
  `orgSlug?`,
  `runId`,
  `ticketId`,
  `subject`,
  `body`,
  `customerEmail`,
  `requestedByUserId?`
- The worker does not verify JWTs and does not receive access or refresh tokens in queue payloads.
- Worker-created drafts remain explicitly agent-attributed:
  `createdBy = 'agent'`,
  `createdByType = AGENT`,
  optional auto-approval fields also use `AGENT`.

## 9. Audit attribution changes

- `HumanApproval.reviewedByUserId` records the authenticated reviewer.
- Manual draft creation uses:
  `createdBy = user:<userId>`,
  `createdByType = USER`,
  `createdByUserId = <userId>`
- Approval patching writes:
  `reviewedByUserId = <userId>`
  and, on approval,
  `approvedByType = USER`,
  `approvedByUserId = <userId>`
- Draft sending writes:
  `sentBy = user:<userId>`,
  `sentByType = USER`,
  `sentByUserId = <userId>`
- Automatic worker-created drafts remain agent-attributed rather than being incorrectly rewritten as human actions.

## 10. Tests added and results

- New/updated auth and Phase 8 API coverage:
  `apps/api/src/auth/auth.service.spec.ts`,
  `apps/api/src/approvals/approvals.controller.spec.ts`,
  `apps/api/src/knowledge/knowledge.service.spec.ts`,
  `apps/api/src/support/support.service.spec.ts`
- Updated worker coverage:
  `apps/worker/src/support.processor.spec.ts`
- Latest final validation results:
  `pnpm lint` passed
  `pnpm typecheck` passed
  `pnpm test` passed
  `pnpm build` passed
  `pnpm db:validate` passed
- Latest test suite counts from `pnpm test`:
  `@apps/api`: 5 suites, 32 tests passed
  `@apps/worker`: 13 suites, 64 tests passed
  `@apps/web`: no tests configured
  `@agentic-support/db`: no tests configured

## 11. CI/CD updates

- `.github/workflows/ci.yml` adds safe auth-related CI environment values:
  `API_BASE_URL`,
  `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`,
  `JWT_ACCESS_TTL`,
  `JWT_REFRESH_TTL`
- These values are explicitly non-production placeholders in CI.
- No real secrets were committed for Phase 8.
- Existing CI jobs remain:
  `quality`,
  `prisma`,
  `security`,
  `docker`
- The `quality` job now exercises auth-aware lint, typecheck, test, and build flows.
- The `prisma` job continues to run `pnpm db:migrate:deploy`, `pnpm db:generate`, and `pnpm db:validate`.

## 12. Manual verification results

- Direct Nest API verification passed:
  registration created a user, organization, settings row, and `OWNER` membership
  `/auth/me` returned memberships and did not expose password or refresh hashes
  cross-tenant ticket access returned `404`
  forged tenant header access returned `403`
  refresh rotation worked
  revoked refresh reuse failed
  logout revoked the active refresh session
- Direct audit attribution verification passed:
  manual draft creation recorded `createdByType = USER` and `createdByUserId`
  draft sending recorded `sentByType = USER` and `sentByUserId`
  approval review recorded `reviewedByUserId`
- Next.js auth proxy verification passed on `http://localhost:3004` with `AUTH_COOKIE_SECURE=false` for local HTTP testing:
  `POST /api/auth/register` set HttpOnly cookies
  `GET /api/auth/me` returned memberships and no hashes
  `POST /api/tickets` created a ticket without trusting client org authority
  `GET /api/tickets` and `GET /api/tickets/:id` stayed tenant-scoped
  `POST /api/auth/refresh` worked
  `POST /api/auth/logout` cleared the session
  refresh after logout returned `401`
  cross-tenant ticket access returned `404`
  forged tenant selection returned `403`

## 13. Migration/bootstrap instructions

- Apply the Phase 8 migration with:
  `pnpm db:migrate:deploy`
- Validate the Prisma schema with:
  `pnpm db:validate`
- Seed development bootstrap data with:
  `pnpm db:seed`
- Seed behavior:
  preserves the existing `org_demo` organization
  creates or updates the demo user `demo.owner@example.com`
  assigns that user an `OWNER` membership in `org_demo`
  preserves historical tickets, events, runs, drafts, and approvals
- Existing organizations keep their current UUIDs. Phase 8 does not backfill real owners for every pre-existing production organization automatically; production bootstrap still needs an admin-controlled owner assignment step.

## 14. Known limitations

- A late Windows-only `pnpm db:generate` rerun can fail if the Prisma query engine DLL is locked by running services. This was observed after Phase 8 validation, while prior `db:generate`, migration, seed, and build/test flows had already succeeded.
- Login rate limiting is implemented in-memory inside `AuthService`, so it is not yet shared across multiple API instances.
- `POST /auth/logout-all` was not implemented.
- Invitations, enterprise SSO, OAuth/social login, and billing were intentionally left out of Phase 8.
- `@apps/web` still has no dedicated automated test suite in the repository.
- Local HTTP verification requires `AUTH_COOKIE_SECURE=false`; production should use secure cookies over HTTPS.

## 15. GitHub issues closed or ready to close

- Ready to close:
  `#2 [CRITICAL] Authorization bypass: unauthenticated access to any organization's data`
  because authenticated tenant membership is now enforced server-side and verified in direct API and Next proxy tests.
- Ready to close:
  `#4 [HIGH] Hardcoded stub identifiers replace real user IDs - no audit trail`
  because human approvals, manual drafts, and sent drafts now record real user ids while agent actions remain explicitly agent-attributed.
- Still open after Phase 8:
  `#16 [LOW] Inconsistent naming: orgId vs orgSlug used interchangeably across layers`
  because internal code still uses the `orgId` field name for the verified organization UUID even though request authority has moved to authenticated tenant context.

## 16. Recommended Phase 9

- Keep Phase 9 focused on observability rather than new auth features.
- Recommended scope:
  structured logs for auth, tenant resolution, and queue processing
  request tracing across web -> API -> worker
  counters and timings for login, refresh, tenant guard failures, queue latency, and approval flow outcomes
  dashboards and alerts for repeated `401`, `403`, refresh failures, and worker run failures
  forward-only operational instrumentation without weakening Phase 8 tenant controls
