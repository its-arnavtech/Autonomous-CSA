import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  ensureCorrelationId,
  normalizeCorrelationId,
} from '@agentic-support/observability';
import { webLogger } from './web-logger';

export { CORRELATION_ID_HEADER };

const ACCESS_COOKIE = 'au_access_token';
const REFRESH_COOKIE = 'au_refresh_token';
const ORGANIZATION_COOKIE = 'au_organization_id';

type JsonMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type ProxyRequestParams = {
  req: NextRequest;
  upstreamUrl: string;
  method: JsonMethod;
  errorContext: string;
  requireAuth?: boolean;
  requireOrganization?: boolean;
  allowRefresh?: boolean;
};

type AuthPayload = {
  accessToken: string;
  refreshToken: string;
  memberships?: Array<{
    organizationId: string;
  }>;
};

function isSecureCookieEnabled() {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

function getSameSite() {
  const raw = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === 'strict') {
    return 'strict' as const;
  }

  if (raw === 'none') {
    return 'none' as const;
  }

  return 'lax' as const;
}

function getAccessCookieMaxAgeSeconds() {
  return parseDurationToSeconds(process.env.JWT_ACCESS_TTL ?? '15m');
}

function getRefreshCookieMaxAgeSeconds() {
  return parseDurationToSeconds(process.env.JWT_REFRESH_TTL ?? '7d');
}

function parseDurationToSeconds(value: string) {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) {
    return 15 * 60;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplier: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multiplier[unit];
}

export function getForwardedHeaders(req: NextRequest) {
  return buildForwardedHeaders(req, resolveCorrelationId(req));
}

function buildForwardedHeaders(req: NextRequest, correlationId: string) {
  const headers = new Headers();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const userAgent = req.headers.get('user-agent');

  if (forwardedFor) {
    headers.set('x-forwarded-for', forwardedFor);
  }

  if (userAgent) {
    headers.set('user-agent', userAgent);
  }

  headers.set(CORRELATION_ID_HEADER, correlationId);

  return headers;
}

export function resolveCorrelationId(req: NextRequest) {
  return (
    normalizeCorrelationId(req.headers.get(CORRELATION_ID_HEADER)) ??
    ensureCorrelationId()
  );
}

function buildProxyHeaders(params: {
  req: NextRequest;
  correlationId: string;
  accessToken?: string;
  organizationId?: string;
  includeJsonBodyHeader: boolean;
}) {
  const headers = buildForwardedHeaders(params.req, params.correlationId);

  if (params.includeJsonBodyHeader) {
    headers.set('content-type', 'application/json');
  }

  if (params.accessToken) {
    headers.set('authorization', `Bearer ${params.accessToken}`);
  }

  if (params.organizationId) {
    headers.set('x-organization-id', params.organizationId);
  }

  return headers;
}

export function getApiBaseUrl() {
  const raw = process.env.API_BASE_URL?.trim();
  return (raw || 'http://localhost:3001').replace(/\/+$/, '');
}

function getLogRoute(upstreamUrl: string) {
  try {
    return new URL(upstreamUrl).pathname;
  } catch {
    return upstreamUrl;
  }
}

export function getAuthCookieNames() {
  return {
    access: ACCESS_COOKIE,
    refresh: REFRESH_COOKIE,
    organization: ORGANIZATION_COOKIE,
  };
}

export function setAuthCookies(
  response: NextResponse,
  payload: AuthPayload,
  organizationId?: string,
) {
  const secure = isSecureCookieEnabled();
  const sameSite = getSameSite();

  response.cookies.set(ACCESS_COOKIE, payload.accessToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: getAccessCookieMaxAgeSeconds(),
  });
  response.cookies.set(REFRESH_COOKIE, payload.refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: getRefreshCookieMaxAgeSeconds(),
  });

  const fallbackOrganizationId =
    organizationId ?? payload.memberships?.[0]?.organizationId;
  if (fallbackOrganizationId) {
    response.cookies.set(ORGANIZATION_COOKIE, fallbackOrganizationId, {
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      maxAge: getRefreshCookieMaxAgeSeconds(),
    });
  }
}

export function setSelectedOrganizationCookie(
  response: NextResponse,
  organizationId: string,
) {
  response.cookies.set(ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: getSameSite(),
    secure: isSecureCookieEnabled(),
    path: '/',
    maxAge: getRefreshCookieMaxAgeSeconds(),
  });
}

export function clearAuthCookies(response: NextResponse) {
  for (const cookieName of [ACCESS_COOKIE, REFRESH_COOKIE, ORGANIZATION_COOKIE]) {
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      sameSite: getSameSite(),
      secure: isSecureCookieEnabled(),
      path: '/',
      maxAge: 0,
    });
  }
}

export async function proxyJsonRequest(params: ProxyRequestParams) {
  const correlationId = resolveCorrelationId(params.req);
  const route = getLogRoute(params.upstreamUrl);

  try {
    webLogger.info('Proxy request started', {
      correlationId,
      method: params.method,
      route,
    });

    const forwardedBody =
      params.method === 'GET' || params.method === 'DELETE'
        ? undefined
        : await params.req.text();

    const upstream = await sendUpstreamRequest({
      req: params.req,
      upstreamUrl: params.upstreamUrl,
      method: params.method,
      body: forwardedBody,
      requireAuth: params.requireAuth ?? true,
      requireOrganization: params.requireOrganization ?? true,
      allowRefresh: params.allowRefresh ?? true,
      correlationId,
    });

    if (upstream.response) {
      upstream.response.headers.set(CORRELATION_ID_HEADER, correlationId);
      webLogger.info('Proxy request completed', {
        correlationId,
        method: params.method,
        route,
        statusCode: upstream.response.status,
      });
      return upstream.response;
    }

    if (!upstream.upstreamResponse.ok) {
      webLogger.info('Proxy request completed', {
        correlationId,
        method: params.method,
        route,
        statusCode: upstream.upstreamResponse.status,
      });
      return buildSanitizedFailureResponse({
        correlationId,
        errorContext: params.errorContext,
        status: upstream.upstreamResponse.status,
        upstreamCorrelationId: upstream.upstreamResponse.headers.get(
          CORRELATION_ID_HEADER,
        ),
      });
    }

    const body = await upstream.upstreamResponse.text();
    const response = new NextResponse(body, {
      status: upstream.upstreamResponse.status,
      headers: {
        'content-type': 'application/json',
        [CORRELATION_ID_HEADER]:
          upstream.upstreamResponse.headers.get(CORRELATION_ID_HEADER) ??
          correlationId,
      },
    });

    if (upstream.refreshedAuth) {
      setAuthCookies(
        response,
        upstream.refreshedAuth,
        upstream.organizationId ?? undefined,
      );
    }

    webLogger.info('Proxy request completed', {
      correlationId,
      method: params.method,
      route,
      statusCode: upstream.upstreamResponse.status,
    });

    return response;
  } catch (error) {
    webLogger.error(
      'Proxy request failed',
      error,
      {
        correlationId,
        context: params.errorContext,
        route: params.upstreamUrl,
      },
    );
    return NextResponse.json(
      {
        error: params.errorContext,
        correlationId,
      },
      {
        status: 502,
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      },
    );
  }
}

export async function fetchAuthenticatedJson(
  req: NextRequest,
  upstreamUrl: string,
  options?: {
    requireOrganization?: boolean;
    allowRefresh?: boolean;
  },
) {
  return sendUpstreamRequest({
    req,
    upstreamUrl,
    method: 'GET',
    requireAuth: true,
    requireOrganization: options?.requireOrganization ?? false,
    allowRefresh: options?.allowRefresh ?? true,
    correlationId: resolveCorrelationId(req),
  });
}

function buildSanitizedFailureResponse(input: {
  correlationId: string;
  errorContext: string;
  status: number;
  upstreamCorrelationId?: string | null;
}) {
  return NextResponse.json(
    {
      error: input.errorContext,
      correlationId: input.upstreamCorrelationId ?? input.correlationId,
    },
    {
      status: input.status,
      headers: {
        [CORRELATION_ID_HEADER]:
          input.upstreamCorrelationId ?? input.correlationId,
      },
    },
  );
}

async function sendUpstreamRequest(params: {
  req: NextRequest;
  upstreamUrl: string;
  method: JsonMethod;
  body?: string;
  requireAuth: boolean;
  requireOrganization: boolean;
  allowRefresh: boolean;
  correlationId: string;
}) {
  const accessToken = params.req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = params.req.cookies.get(REFRESH_COOKIE)?.value;
  const organizationId = params.req.cookies.get(ORGANIZATION_COOKIE)?.value;

  if (params.requireAuth && !accessToken && !refreshToken) {
    return {
      response: NextResponse.json(
        { error: 'Authentication required', correlationId: params.correlationId },
        {
          status: 401,
          headers: { [CORRELATION_ID_HEADER]: params.correlationId },
        },
      ),
    };
  }

  if (params.requireOrganization && !organizationId) {
    return {
      response: NextResponse.json(
        {
          error: 'Organization selection required',
          correlationId: params.correlationId,
        },
        {
          status: 400,
          headers: { [CORRELATION_ID_HEADER]: params.correlationId },
        },
      ),
    };
  }

  let upstreamResponse = await fetch(params.upstreamUrl, {
    method: params.method,
    cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: buildProxyHeaders({
        req: params.req,
        correlationId: params.correlationId,
        accessToken,
        organizationId: params.requireOrganization ? organizationId : undefined,
        includeJsonBodyHeader:
          params.method !== 'GET' && params.method !== 'DELETE',
    }),
    body: params.body,
  });

  let refreshedAuth: AuthPayload | undefined;
  if (
    upstreamResponse.status === 401 &&
    params.allowRefresh &&
    refreshToken
  ) {
    refreshedAuth =
      (await refreshTokens(params.req, refreshToken, params.correlationId)) ??
      undefined;

    if (!refreshedAuth) {
      const response = NextResponse.json(
        { error: 'Authentication required' },
        {
          status: 401,
          headers: { [CORRELATION_ID_HEADER]: params.correlationId },
        },
      );
      clearAuthCookies(response);
      return { response };
    }

    upstreamResponse = await fetch(params.upstreamUrl, {
      method: params.method,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: buildProxyHeaders({
        req: params.req,
        correlationId: params.correlationId,
        accessToken: refreshedAuth.accessToken,
        organizationId: params.requireOrganization ? organizationId : undefined,
        includeJsonBodyHeader:
          params.method !== 'GET' && params.method !== 'DELETE',
      }),
      body: params.body,
    });
  }

  return {
    upstreamResponse,
    refreshedAuth,
    organizationId,
  };
}

async function refreshTokens(
  req: NextRequest,
  refreshToken: string,
  correlationId: string,
) {
  const headers = buildForwardedHeaders(req, correlationId);
  headers.set('content-type', 'application/json');

  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
    headers,
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AuthPayload;
}
