import { randomUUID } from 'crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@agentic-support/db';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PasswordService } from './password.service';
import { OrganizationRole } from './organization-role.constants';
import { TokenService } from './token.service';
import type { TenantMembership } from './authenticated-user.type';
import type {
  LoginDto,
  RegisterDto,
} from './auth.dto';

type RequestMetadata = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

type SafeAuthResponse = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  memberships: Array<{
    organizationId: string;
    organizationSlug: string;
    organizationName: string;
    role: OrganizationRole;
  }>;
  accessToken: string;
  refreshToken: string;
};

type SafeMeResponse = Omit<SafeAuthResponse, 'accessToken' | 'refreshToken'>;

const noopMetrics = {
  incrementAuthFailure: () => undefined,
  incrementAuthLogin: () => undefined,
  incrementAuthRefresh: () => undefined,
  incrementAuthRegistration: () => undefined,
} satisfies Pick<
  MetricsService,
  | 'incrementAuthFailure'
  | 'incrementAuthLogin'
  | 'incrementAuthRefresh'
  | 'incrementAuthRegistration'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    @Optional()
    @Inject(RateLimitService)
    private readonly rateLimitService: Pick<
      RateLimitService,
      'assertLoginAllowed'
    > = {
      assertLoginAllowed: () => Promise.resolve(),
    },
    @Optional()
    @Inject(MetricsService)
    private readonly metrics: MetricsService = noopMetrics as unknown as MetricsService,
  ) {}

  async register(dto: RegisterDto, metadata: RequestMetadata) {
    try {
      const normalizedEmail = this.normalizeEmail(dto.email);
      const organizationSlug = this.normalizeOrganizationSlug(
        dto.organizationSlug ?? dto.organizationName,
      );

      const [existingUser, existingOrganization] = await Promise.all([
        this.prisma.user.findUnique({
          where: { normalizedEmail },
          select: { id: true },
        }),
        this.prisma.organization.findUnique({
          where: { slug: organizationSlug },
          select: { id: true },
        }),
      ]);

      if (existingUser) {
        throw new ConflictException('Email is already in use');
      }

      if (existingOrganization) {
        throw new ConflictException('Organization slug is already in use');
      }

      const passwordHash = await this.passwordService.hashPassword(dto.password);
      const userId = randomUUID();
      const organizationId = randomUUID();
      const membershipId = randomUUID();
      const sessionId = randomUUID();
      const refreshToken = this.tokenService.createRefreshToken(userId, sessionId);
      const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
      const accessToken = this.tokenService.createAccessToken({
        id: userId,
        email: normalizedEmail,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: normalizedEmail,
            normalizedEmail,
            passwordHash,
            displayName: dto.displayName?.trim() || null,
          },
        });

        await tx.organization.create({
          data: {
            id: organizationId,
            name: dto.organizationName.trim(),
            slug: organizationSlug,
          },
        });

        await tx.organizationSettings.create({
          data: { orgId: organizationId },
        });

        await tx.organizationMembership.create({
          data: {
            id: membershipId,
            userId,
            organizationId,
            role: OrganizationRole.OWNER,
          },
        });

        await tx.refreshSession.create({
          data: {
            id: sessionId,
            userId,
            tokenHash: this.tokenService.hashRefreshToken(refreshToken),
            expiresAt: this.tokenService.getRefreshExpiry(refreshPayload.exp),
            userAgent: metadata.userAgent ?? null,
            ipAddress: metadata.ipAddress ?? null,
          },
        });
      });

      const profile = await this.getMe(userId);
      this.metrics.incrementAuthRegistration('success');

      return {
        ...profile,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      this.metrics.incrementAuthRegistration('validation_error');
      throw error;
    }
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.rateLimitService.assertLoginAllowed(
      normalizedEmail,
      metadata.ipAddress,
    );

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      this.metrics.incrementAuthFailure('login', 'auth_error');
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      this.metrics.incrementAuthFailure('login', 'auth_error');
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionId = randomUUID();
    const refreshToken = this.tokenService.createRefreshToken(user.id, sessionId);
    const refreshPayload = this.tokenService.verifyRefreshToken(refreshToken);
    const accessToken = this.tokenService.createAccessToken({
      id: user.id,
      email: user.email,
    });

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: this.tokenService.hashRefreshToken(refreshToken),
        expiresAt: this.tokenService.getRefreshExpiry(refreshPayload.exp),
        userAgent: metadata.userAgent ?? null,
        ipAddress: metadata.ipAddress ?? null,
      },
    });

    const profile = await this.getMe(user.id);
    this.metrics.incrementAuthLogin('success');

    return {
      ...profile,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string, metadata: RequestMetadata) {
    let payload: ReturnType<TokenService['verifyRefreshToken']>;

    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      this.metrics.incrementAuthRefresh('auth_error');
      throw new UnauthorizedException('Invalid refresh token');
    }

    const existingSession = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !existingSession ||
      existingSession.revokedAt ||
      existingSession.expiresAt.getTime() <= Date.now() ||
      !existingSession.user.isActive
    ) {
      this.metrics.incrementAuthRefresh('auth_error');
      throw new UnauthorizedException('Invalid refresh token');
    }

    const expectedHash = this.tokenService.hashRefreshToken(refreshToken);
    if (expectedHash !== existingSession.tokenHash) {
      this.metrics.incrementAuthRefresh('auth_error');
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newSessionId = randomUUID();
    const nextRefreshToken = this.tokenService.createRefreshToken(
      existingSession.user.id,
      newSessionId,
    );
    const nextRefreshPayload =
      this.tokenService.verifyRefreshToken(nextRefreshToken);
    const accessToken = this.tokenService.createAccessToken({
      id: existingSession.user.id,
      email: existingSession.user.email,
    });

    await this.prisma.$transaction(async (tx) => {
      const revokeResult = await tx.refreshSession.updateMany({
        where: {
          id: existingSession.id,
          revokedAt: null,
          tokenHash: expectedHash,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });

      if (revokeResult.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await tx.refreshSession.create({
        data: {
          id: newSessionId,
          userId: existingSession.user.id,
          tokenHash: this.tokenService.hashRefreshToken(nextRefreshToken),
          expiresAt: this.tokenService.getRefreshExpiry(nextRefreshPayload.exp),
          userAgent: metadata.userAgent ?? existingSession.userAgent ?? null,
          ipAddress: metadata.ipAddress ?? existingSession.ipAddress ?? null,
        },
      });
    });

    const profile = await this.getMe(existingSession.user.id);
    this.metrics.incrementAuthRefresh('success');

    return {
      ...profile,
      accessToken,
      refreshToken: nextRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.tokenService.verifyRefreshToken(refreshToken);

      await this.prisma.refreshSession.updateMany({
        where: {
          id: payload.sid,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async getMe(userId: string): Promise<SafeMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
          orderBy: [
            { role: 'asc' },
            { organization: { name: 'asc' } },
          ],
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationSlug: membership.organization.slug,
        organizationName: membership.organization.name,
        role: membership.role,
      })),
    };
  }

  async resolveTenantMembership(
    userId: string,
    organizationId: string,
  ): Promise<TenantMembership | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        user: { isActive: true },
      },
      include: {
        organization: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      membershipId: membership.id,
      organizationId: membership.organization.id,
      organizationSlug: membership.organization.slug,
      organizationName: membership.organization.name,
      role: membership.role,
    };
  }

  async assertOrganizationAccess(userId: string, organizationId: string) {
    return this.resolveTenantMembership(userId, organizationId);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizeOrganizationSlug(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (slug.length < 3 || slug.length > 64) {
      throw new ConflictException(
        'Organization slug must be between 3 and 64 characters after normalization',
      );
    }

    return slug;
  }
}
