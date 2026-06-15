import { NextRequest, NextResponse } from 'next/server';
import {
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
  setAuthCookies,
} from '../../_utils/proxy';

export async function POST(req: NextRequest) {
  try {
    const headers = getForwardedHeaders(req);
    headers.set('content-type', 'application/json');

    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers,
      body: await req.text(),
    });

    const body = await response.text();
    if (!response.ok) {
      return new NextResponse(body || '{"error":"Login failed"}', {
        status: response.status,
        headers: { 'content-type': 'application/json' },
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
    setAuthCookies(nextResponse, payload, payload.memberships[0]?.organizationId);
    return nextResponse;
  } catch (error) {
    console.error('[auth/login] proxy failed', error);
    const response = NextResponse.json({ error: 'Login failed' }, { status: 502 });
    clearAuthCookies(response);
    return response;
  }
}
