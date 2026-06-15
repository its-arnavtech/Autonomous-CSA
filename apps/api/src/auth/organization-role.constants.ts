export const OrganizationRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
  VIEWER: 'VIEWER',
} as const;

export type OrganizationRole =
  (typeof OrganizationRole)[keyof typeof OrganizationRole];

export const READ_ORG_ROLES = Object.values(OrganizationRole);

export const MUTATING_ORG_ROLES = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.AGENT,
] as const;

export const MANAGE_ORG_ROLES = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
] as const;
