import type { Request } from 'express';
import type { OrganizationRole } from './organization-role.constants';

export type AuthenticatedUser = {
  userId: string;
  email: string;
  sessionId?: string;
};

export type TenantMembership = {
  membershipId: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: OrganizationRole;
};

export type AuthenticatedRequest = Request & {
  authenticatedUser?: AuthenticatedUser;
  currentOrganization?: TenantMembership;
};
