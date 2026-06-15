import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { OperationsController } from './operations.controller';

describe('Phase 9 operations RBAC', () => {
  it('requires OWNER or ADMIN for replay and resolve actions', () => {
    const replayRoles = Reflect.getMetadata(
      ROLES_KEY,
      OperationsController.prototype.replayFailure,
    );
    const resolveRoles = Reflect.getMetadata(
      ROLES_KEY,
      OperationsController.prototype.resolveFailure,
    );

    expect(replayRoles).toEqual(['OWNER', 'ADMIN']);
    expect(resolveRoles).toEqual(['OWNER', 'ADMIN']);
  });

  it('rejects AGENT and VIEWER replay attempts through the roles guard', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    const createContext = (role: string) =>
      ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            currentOrganization: {
              role,
            },
          }),
        }),
      }) as unknown as ExecutionContext;

    expect(() => guard.canActivate(createContext('AGENT'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext('VIEWER'))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(createContext('OWNER'))).toBe(true);
    expect(guard.canActivate(createContext('ADMIN'))).toBe(true);
  });
});
