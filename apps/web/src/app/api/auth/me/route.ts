import { NextRequest, NextResponse } from 'next/server';
import {
  clearAuthCookies,
  fetchAuthenticatedJson,
  getApiBaseUrl,
  setAuthCookies,
} from '../../_utils/proxy';

export async function GET(req: NextRequest) {
  const result = await fetchAuthenticatedJson(
    req,
    `${getApiBaseUrl()}/auth/me`,
    { requireOrganization: false },
  );

  if ('response' in result) {
    return result.response;
  }

  const body = await result.upstreamResponse.text();
  if (!result.upstreamResponse.ok) {
    const response = NextResponse.json(
      { error: 'Authentication required' },
      { status: result.upstreamResponse.status },
    );
    if (result.upstreamResponse.status === 401) {
      clearAuthCookies(response);
    }
    return response;
  }

  const nextResponse = new NextResponse(body, {
    status: result.upstreamResponse.status,
    headers: { 'content-type': 'application/json' },
  });

  if (result.refreshedAuth) {
    setAuthCookies(nextResponse, result.refreshedAuth, result.organizationId);
  }

  return nextResponse;
}
