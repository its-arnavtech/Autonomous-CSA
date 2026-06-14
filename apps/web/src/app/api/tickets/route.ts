import { getApiBaseUrl, proxyJsonRequest } from '../_utils/proxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';
  const upstreamUrl = `${getApiBaseUrl()}/tickets?orgId=${encodeURIComponent(orgId)}`;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl,
    errorContext: 'Failed to load tickets from API',
  });
}
