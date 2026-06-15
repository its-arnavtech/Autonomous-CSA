export const OPERATIONS_READ_ROLES = ['OWNER', 'ADMIN', 'AGENT', 'VIEWER'] as const;
export type OperationsReadRole = (typeof OPERATIONS_READ_ROLES)[number];

export function isSupportedOperationsRole(
  role: string,
): role is OperationsReadRole {
  return (OPERATIONS_READ_ROLES as readonly string[]).includes(role);
}

export function canManageOperations(role: string) {
  return role === 'OWNER' || role === 'ADMIN';
}
