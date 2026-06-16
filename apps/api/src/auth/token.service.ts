import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { loadApiRuntimeConfig } from '@agentic-support/observability';
import { Injectable } from '@nestjs/common';

type AccessTokenPayload = {
  sub: string;
  email: string;
  typ: 'access';
  iat: number;
  exp: number;
};

type RefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: 'refresh';
  iat: number;
  exp: number;
};

type AuthTokenConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;

  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseDurationToSeconds(rawValue: string, fallbackValue: string) {
  const value = rawValue?.trim() || fallbackValue;
  const match = /^(\d+)([smhd])$/i.exec(value);

  if (!match) {
    throw new Error(
      `Invalid auth TTL "${value}". Use a positive integer ending in s, m, h, or d.`,
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multipliers[unit];
}

@Injectable()
export class TokenService {
  private readonly runtimeConfig = loadApiRuntimeConfig();
  private readonly config: AuthTokenConfig = {
    accessSecret: this.runtimeConfig.auth.accessSecret,
    refreshSecret: this.runtimeConfig.auth.refreshSecret,
    accessTtlSeconds: this.runtimeConfig.auth.accessTtlSeconds,
    refreshTtlSeconds: this.runtimeConfig.auth.refreshTtlSeconds,
  };

  createAccessToken(user: { id: string; email: string }) {
    return this.signToken(
      {
        sub: user.id,
        email: user.email,
        typ: 'access',
      },
      this.config.accessSecret,
      this.config.accessTtlSeconds,
    );
  }

  createRefreshToken(userId: string, sessionId: string) {
    return this.signToken(
      {
        sub: userId,
        sid: sessionId,
        typ: 'refresh',
      },
      this.config.refreshSecret,
      this.config.refreshTtlSeconds,
    );
  }

  verifyAccessToken(token: string) {
    const payload = this.verifyToken(token, this.config.accessSecret);

    if (payload.typ !== 'access' || typeof payload.email !== 'string') {
      throw new Error('Invalid access token payload');
    }

    return payload as AccessTokenPayload;
  }

  verifyRefreshToken(token: string) {
    const payload = this.verifyToken(token, this.config.refreshSecret);

    if (payload.typ !== 'refresh' || typeof payload.sid !== 'string') {
      throw new Error('Invalid refresh token payload');
    }

    return payload as RefreshTokenPayload;
  }

  hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshExpiry(expiresAtSecondsFromEpoch: number) {
    return new Date(expiresAtSecondsFromEpoch * 1000);
  }

  private signToken(
    payload: Record<string, string>,
    secret: string,
    ttlSeconds: number,
  ) {
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    };
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();

    return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
  }

  private verifyToken(token: string, secret: string) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as {
      alg?: string;
      typ?: string;
    };

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new Error('Unsupported token algorithm');
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const actualSignature = Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      throw new Error('Invalid token signature');
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      exp?: number;
      iat?: number;
      sub?: string;
      typ?: string;
      email?: string;
      sid?: string;
    };

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      typeof payload.typ !== 'string'
    ) {
      throw new Error('Invalid token payload');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }
}
