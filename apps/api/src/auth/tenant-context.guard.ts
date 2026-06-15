import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './authenticated-user.type';

const ORGANIZATION_HEADER = 'x-organization-id';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const user = request.authenticatedUser;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const organizationId = request.header(ORGANIZATION_HEADER)?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing X-Organization-Id header');
    }

    const membership = await this.authService.resolveTenantMembership(
      user.userId,
      organizationId,
    );

    if (!membership) {
      throw new ForbiddenException('Forbidden');
    }

    request.currentOrganization = membership;
    return true;
  }
}
