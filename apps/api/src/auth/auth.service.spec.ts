import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn(),
      },
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const passwordService = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
    };

    const tokenService = {
      createRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      createAccessToken: jest.fn(),
      hashRefreshToken: jest.fn(),
      getRefreshExpiry: jest.fn(),
    };

    return {
      prisma,
      passwordService,
      tokenService,
      service: new AuthService(
        prisma as never,
        passwordService as never,
        tokenService as never,
      ),
    };
  }

  it('register creates user, organization, settings, membership, and refresh session', async () => {
    const { prisma, passwordService, tokenService, service } = createService();
    const tx = {
      user: { create: jest.fn() },
      organization: { create: jest.fn() },
      organizationSettings: { create: jest.fn() },
      organizationMembership: { create: jest.fn() },
      refreshSession: { create: jest.fn() },
    };

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    passwordService.hashPassword.mockResolvedValue('hashed-password');
    tokenService.createRefreshToken.mockReturnValue('refresh-token');
    tokenService.verifyRefreshToken.mockReturnValue({ exp: 1_800_000, sid: 'session_1' });
    tokenService.createAccessToken.mockReturnValue('access-token');
    tokenService.hashRefreshToken.mockReturnValue('refresh-hash');
    tokenService.getRefreshExpiry.mockReturnValue(new Date('2026-06-21T00:00:00.000Z'));
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_1',
      email: 'owner@example.com',
      displayName: 'Owner',
      isActive: true,
      memberships: [
        {
          role: 'OWNER',
          organization: {
            id: 'org_1',
            slug: 'acme',
            name: 'Acme',
          },
        },
      ],
    });

    const result = await service.register(
      {
        email: 'Owner@example.com',
        password: 'Password12345',
        displayName: 'Owner',
        organizationName: 'Acme',
        organizationSlug: 'acme',
      },
      {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
    );

    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.organization.create).toHaveBeenCalled();
    expect(tx.organizationSettings.create).toHaveBeenCalled();
    expect(tx.organizationMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'OWNER',
        }),
      }),
    );
    expect(tx.refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: 'refresh-hash',
          userAgent: 'jest',
          ipAddress: '127.0.0.1',
        }),
      }),
    );
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      memberships: [
        {
          organizationId: 'org_1',
          organizationSlug: 'acme',
          organizationName: 'Acme',
          role: 'OWNER',
        },
      ],
    });
  });

  it('rejects duplicate emails during registration', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({ id: 'user_1' });
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      service.register(
        {
          email: 'owner@example.com',
          password: 'Password12345',
          organizationName: 'Acme',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a generic invalid credentials error for bad logins', async () => {
    const { prisma, passwordService, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'owner@example.com',
      passwordHash: 'stored-hash',
      isActive: true,
    });
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login(
        {
          email: 'owner@example.com',
          password: 'wrong-password',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the stored refresh session', async () => {
    const { prisma, tokenService, service } = createService();
    const tx = {
      refreshSession: {
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    tokenService.verifyRefreshToken
      .mockReturnValueOnce({ sid: 'session_1', exp: 2_000_000, sub: 'user_1' })
      .mockReturnValueOnce({ sid: 'session_2', exp: 2_000_500, sub: 'user_1' });
    tokenService.hashRefreshToken
      .mockReturnValueOnce('old-hash')
      .mockReturnValueOnce('new-hash');
    tokenService.createRefreshToken.mockReturnValue('new-refresh-token');
    tokenService.createAccessToken.mockReturnValue('new-access-token');
    tokenService.getRefreshExpiry.mockReturnValue(new Date('2026-06-22T00:00:00.000Z'));
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session_1',
      tokenHash: 'old-hash',
      revokedAt: null,
      expiresAt: new Date('2026-06-21T00:00:00.000Z'),
      userAgent: 'browser',
      ipAddress: '127.0.0.1',
      user: {
        id: 'user_1',
        email: 'owner@example.com',
        isActive: true,
      },
    });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'owner@example.com',
      displayName: 'Owner',
      isActive: true,
      memberships: [],
    });

    const result = await service.refresh('old-refresh-token', {
      userAgent: 'browser',
      ipAddress: '127.0.0.1',
    });

    expect(tx.refreshSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session_1' },
      }),
    );
    expect(tx.refreshSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: 'new-hash',
        }),
      }),
    );
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('getMe returns memberships without hashes or token rows', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'owner@example.com',
      displayName: 'Owner',
      isActive: true,
      memberships: [
        {
          role: 'OWNER',
          organization: {
            id: 'org_1',
            slug: 'acme',
            name: 'Acme',
          },
        },
      ],
    });

    await expect(service.getMe('user_1')).resolves.toEqual({
      user: {
        id: 'user_1',
        email: 'owner@example.com',
        displayName: 'Owner',
      },
      memberships: [
        {
          organizationId: 'org_1',
          organizationSlug: 'acme',
          organizationName: 'Acme',
          role: 'OWNER',
        },
      ],
    });
  });
});
