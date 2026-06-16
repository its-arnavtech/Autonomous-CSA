import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
  getAuthCookieNames,
  resolveCorrelationId,
  setAuthCookies,
} from '../../_utils/proxy';
import { webLogger } from '../../_utils/web-logger';

export async function POST(req: NextRequest) {
  const correlationId = resolveCorrelationId(req);
  const cookieNames = getAuthCookieNames();
  const refreshToken = req.cookies.get(cookieNames.refresh)?.value;
  if (!refreshToken) {
    const response = NextResponse.json(
      { error: 'Authentication required', correlationId },
      {
        status: 401,
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      },
    );
    clearAuthCookies(response);
    return response;
  }

  try {
    const headers = getForwardedHeaders(req);
    headers.set('content-type', 'application/json');

    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers,
      body: JSON.stringify({ refreshToken }),
    });

    const body = await response.text();
    if (!response.ok) {
      const nextResponse = NextResponse.json(
        { error: 'Authentication required', correlationId },
        {
          status: response.status,
          headers: {
            [CORRELATION_ID_HEADER]:
              response.headers.get(CORRELATION_ID_HEADER) ?? correlationId,
          },
        },
      );
      clearAuthCookies(nextResponse);
      return nextResponse;
    }

    const payload = JSON.parse(body) as {
      accessToken: string;
      refreshToken: string;
      user: unknown;
      memberships: Array<{ organizationId: string }>;
    };
    const nextResponse = NextResponse.json({
      user: payload.user,
      memberships: payload.memberships,
    });
    nextResponse.headers.set(
      CORRELATION_ID_HEADER,
      response.headers.get(CORRELATION_ID_HEADER) ?? correlationId,
    );
    setAuthCookies(
      nextResponse,
      payload,
      req.cookies.get(cookieNames.organization)?.value,
    );
    return nextResponse;
  } catch (error) {
    webLogger.error('Refresh proxy failed', error, { correlationId });
    const nextResponse = NextResponse.json(
      { error: 'Authentication required', correlationId },
      {
        status: 502,
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      },
    );
    clearAuthCookies(nextResponse);
    return nextResponse;
  }
}
