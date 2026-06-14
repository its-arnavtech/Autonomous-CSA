import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { orgId: string } | Promise<{ orgId: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const { orgId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/orgs/${encodeURIComponent(orgId)}/settings`;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl,
    errorContext: 'Failed to load organization settings from API',
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { orgId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/orgs/${encodeURIComponent(orgId)}/settings`;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl,
    errorContext: 'Failed to update organization settings',
  });
}
