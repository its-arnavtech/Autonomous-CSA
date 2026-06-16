import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  ensureCorrelationId,
  loadWebRuntimeConfig,
  normalizeCorrelationId,
} from '@agentic-support/observability';
import { webLogger } from './web-logger';

export { CORRELATION_ID_HEADER };

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

function getWebConfig() {
  return loadWebRuntimeConfig();
}

export function getAuthCookieNames() {
  const prefix = getWebConfig().cookieNamePrefix;
  return {
    access: `${prefix}_access_token`,
    refresh: `${prefix}_refresh_token`,
    organization: `${prefix}_organization_id`,
  };
}

function getAccessCookieMaxAgeSeconds() {
  return getWebConfig().accessTtlSeconds;
}

function getRefreshCookieMaxAgeSeconds() {
  return getWebConfig().refreshTtlSeconds;
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
  return getWebConfig().apiBaseUrl.replace(/\/+$/, '');
}

function getLogRoute(upstreamUrl: string) {
  try {
    return new URL(upstreamUrl).pathname;
  } catch {
    return upstreamUrl;
  }
}

export function setAuthCookies(
  response: NextResponse,
  payload: AuthPayload,
  organizationId?: string,
) {
  const config = getWebConfig();
  const cookieNames = getAuthCookieNames();
  const cookieBase = {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    path: '/',
  } as const;

  response.cookies.set(cookieNames.access, payload.accessToken, {
    ...cookieBase,
    maxAge: getAccessCookieMaxAgeSeconds(),
  });
  response.cookies.set(cookieNames.refresh, payload.refreshToken, {
    ...cookieBase,
    maxAge: getRefreshCookieMaxAgeSeconds(),
  });

  const fallbackOrganizationId =
    organizationId ?? payload.memberships?.[0]?.organizationId;
  if (fallbackOrganizationId) {
    response.cookies.set(cookieNames.organization, fallbackOrganizationId, {
      ...cookieBase,
      maxAge: getRefreshCookieMaxAgeSeconds(),
    });
  }
}

export function setSelectedOrganizationCookie(
  response: NextResponse,
  organizationId: string,
) {
  const config = getWebConfig();
  const cookieNames = getAuthCookieNames();
  response.cookies.set(cookieNames.organization, organizationId, {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    path: '/',
    maxAge: getRefreshCookieMaxAgeSeconds(),
  });
}

export function clearAuthCookies(response: NextResponse) {
  const config = getWebConfig();
  const cookieNames = getAuthCookieNames();
  for (const cookieName of [
    cookieNames.access,
    cookieNames.refresh,
    cookieNames.organization,
  ]) {
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      domain: config.cookieDomain,
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
  const cookieNames = getAuthCookieNames();
  const accessToken = params.req.cookies.get(cookieNames.access)?.value;
  const refreshToken = params.req.cookies.get(cookieNames.refresh)?.value;
  const organizationId = params.req.cookies.get(cookieNames.organization)?.value;

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
