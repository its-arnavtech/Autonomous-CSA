import { NextRequest, NextResponse } from 'next/server';
import {
  clearAuthCookies,
  getForwardedHeaders,
  getApiBaseUrl,
} from '../../_utils/proxy';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('au_refresh_token')?.value;

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
      console.error('[auth/logout] upstream revoke failed', error);
      return undefined;
    });
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
