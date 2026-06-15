import { SetMetadata } from '@nestjs/common';
import type { OrganizationRole } from './organization-role.constants';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: OrganizationRole[]) =>
  SetMetadata(ROLES_KEY, roles);
