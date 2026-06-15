import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAuthenticatedJson,
  getApiBaseUrl,
  setAuthCookies,
  setSelectedOrganizationCookie,
} from '../../_utils/proxy';

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as { organizationId?: string };
  const organizationId = payload.organizationId?.trim();

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Organization selection is required' },
      { status: 400 },
    );
  }

  const result = await fetchAuthenticatedJson(
    req,
    `${getApiBaseUrl()}/auth/me`,
    { requireOrganization: false },
  );

  if ('response' in result) {
    return result.response;
  }

  if (!result.upstreamResponse.ok) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: result.upstreamResponse.status },
    );
  }

  const me = (await result.upstreamResponse.json()) as {
    memberships: Array<{ organizationId: string }>;
  };
  const membership = me.memberships.find(
    (item) => item.organizationId === organizationId,
  );

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const response = NextResponse.json({ organizationId });
  setSelectedOrganizationCookie(response, organizationId);
  if (result.refreshedAuth) {
    setAuthCookies(response, result.refreshedAuth, organizationId);
  }
  return response;
}
