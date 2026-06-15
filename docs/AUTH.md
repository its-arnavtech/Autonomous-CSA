# Authentication and Tenant Enforcement

## Overview

Phase 8 makes the Nest API the authentication authority and removes request-provided `orgId` and org slug values as the trust boundary.

The secure request path is:

1. The browser submits login or registration to Next.js route handlers.
2. Next.js calls Nest auth endpoints under `/auth/*`.
3. Nest returns a short-lived access token plus a rotating refresh token.
4. Next stores both tokens in HttpOnly cookies and also stores the selected organization id in an HttpOnly tenant cookie.
5. Protected Next.js proxy routes forward:
   - `Authorization: Bearer <access token>`
   - `X-Organization-Id: <selected organization id>`
6. The API verifies the access token, resolves membership, and attaches verified tenant context before controller logic runs.

## Exact browser-side cookies

The shared proxy helper in `apps/web/src/app/api/_utils/proxy.ts` uses these cookie names:

- `au_access_token`
- `au_refresh_token`
- `au_organization_id`

Cookie behavior:

- `HttpOnly: true`
- `SameSite`: controlled by `AUTH_COOKIE_SAME_SITE`, default `lax`
- `Secure`: controlled by `AUTH_COOKIE_SECURE`, defaulting to `true` in production and overridable for local HTTP testing

## Exact auth routes

NestJS API auth endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Next.js browser-facing auth routes:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/organization`

## Data model additions

Phase 8 adds:

- `User`
- `OrganizationMembership`
- `RefreshSession`
- `OrganizationRole` with `OWNER`, `ADMIN`, `AGENT`, `VIEWER`
- `ActorType` with `USER`, `AGENT`, `SYSTEM`
- audit attribution fields on `HumanApproval` and `OutboundDraft`

Existing organization ids remain unchanged. Existing compatibility string fields such as `createdBy` remain in place while typed attribution fields are added alongside them.

## Tenant selection and enforcement

The authoritative tenant header is `X-Organization-Id`.

- Browser pages no longer trust `orgId` query parameters.
- Next.js stores the selected organization in `au_organization_id`.
- Next proxy routes attach `X-Organization-Id` from that cookie.
- `TenantContextGuard` verifies that the authenticated user belongs to that organization.
- Missing tenant context returns `400`.
- Unauthenticated access returns `401`.
- Authenticated non-members return `403`.
- Record queries remain organization-scoped in service methods as defense in depth.

## Roles and permissions

Controller role sets are centralized in `apps/api/src/auth/organization-role.constants.ts`.

- `OWNER`: full organization access
- `ADMIN`: operational organization access, including settings and knowledge management
- `AGENT`: ticket and draft operations plus runtime visibility
- `VIEWER`: read-only access

Current controller defaults:

- Read routes use `READ_ORG_ROLES`
- Ticket mutations, draft mutations, and approval actions use `MUTATING_ORG_ROLES`
- Organization settings and knowledge mutations use `MANAGE_ORG_ROLES`

## Token handling

- Access token default TTL: `15m`
- Refresh token default TTL: `7d`
- Refresh tokens are hashed before storage in Postgres
- Refresh rotates the session and revokes the previous token row
- Logout revokes the current refresh session and clears cookies
- Access and refresh tokens are never stored in `localStorage`

## Request-provided org identifiers

Phase 8 removes request-provided organization identifiers as an authority source.

- Controllers no longer trust query/body/path `orgId` as the tenant selector.
- Protected routes use verified tenant context instead.
- Existing internal field names such as `Ticket.orgId` still refer to the verified organization UUID in the database.

## Demo seed bootstrap

`pnpm db:seed` preserves `org_demo` and ensures a demo owner user exists:

- Email: `demo.owner@example.com`
- Password: `DemoPassword123!`
- Organization slug: `org_demo`
- Membership role: `OWNER`

This is development-only bootstrap data. Production bootstrap for pre-existing organizations still needs an admin-controlled initial owner assignment process.
