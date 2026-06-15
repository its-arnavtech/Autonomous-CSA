import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
  resolveCorrelationId,
  setAuthCookies,
} from '../../_utils/proxy';
import { webLogger } from '../../_utils/web-logger';

export async function POST(req: NextRequest) {
  const correlationId = resolveCorrelationId(req);
  try {
    const headers = getForwardedHeaders(req);
    headers.set('content-type', 'application/json');

    const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers,
      body: await req.text(),
    });

    const body = await response.text();
    if (!response.ok) {
      return new NextResponse(body || '{"error":"Registration failed"}', {
        status: response.status,
        headers: {
          'content-type': 'application/json',
          [CORRELATION_ID_HEADER]:
            response.headers.get(CORRELATION_ID_HEADER) ?? correlationId,
        },
      });
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
    setAuthCookies(nextResponse, payload, payload.memberships[0]?.organizationId);
    return nextResponse;
  } catch (error) {
    webLogger.error('Registration proxy failed', error, { correlationId });
    const response = NextResponse.json(
      { error: 'Registration failed', correlationId },
      {
        status: 502,
        headers: { [CORRELATION_ID_HEADER]: correlationId },
      },
    );
    clearAuthCookies(response);
    return response;
  }
}
