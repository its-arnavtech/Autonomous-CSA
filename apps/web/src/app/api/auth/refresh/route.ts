import { NextRequest, NextResponse } from 'next/server';
import {
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
  setAuthCookies,
} from '../../_utils/proxy';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('au_refresh_token')?.value;
  if (!refreshToken) {
    const response = NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
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
        { error: 'Authentication required' },
        { status: response.status },
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
    setAuthCookies(
      nextResponse,
      payload,
      req.cookies.get('au_organization_id')?.value,
    );
    return nextResponse;
  } catch (error) {
    console.error('[auth/refresh] proxy failed', error);
    const nextResponse = NextResponse.json(
      { error: 'Authentication required' },
      { status: 502 },
    );
    clearAuthCookies(nextResponse);
    return nextResponse;
  }
}
