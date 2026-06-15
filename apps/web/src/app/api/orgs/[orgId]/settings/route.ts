import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { orgId: string } | Promise<{ orgId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  await params;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/orgs/settings`,
    errorContext: 'Failed to load organization settings from API',
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  await params;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/orgs/settings`,
    errorContext: 'Failed to update organization settings',
  });
}
