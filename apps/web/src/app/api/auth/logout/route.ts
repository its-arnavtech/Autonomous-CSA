import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
  getAuthCookieNames,
  resolveCorrelationId,
} from '../../_utils/proxy';
import { webLogger } from '../../_utils/web-logger';

export async function POST(req: NextRequest) {
  const correlationId = resolveCorrelationId(req);
  const refreshToken = req.cookies.get(getAuthCookieNames().refresh)?.value;

  if (refreshToken) {
    const headers = getForwardedHeaders(req);
    headers.set('content-type', 'application/json');

    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers,
      body: JSON.stringify({ refreshToken }),
    }).catch((error) => {
      webLogger.warn('Logout upstream revoke failed', {
        correlationId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    });
  }

  const response = NextResponse.json({ success: true });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  clearAuthCookies(response);
  return response;
}
