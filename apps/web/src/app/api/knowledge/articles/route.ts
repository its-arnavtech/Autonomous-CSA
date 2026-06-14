import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q');
  const upstreamUrl = new URL(`${getApiBaseUrl()}/knowledge/articles`);
  upstreamUrl.searchParams.set('orgId', orgId);
  if (status) {
    upstreamUrl.searchParams.set('status', status);
  }
  if (q) {
    upstreamUrl.searchParams.set('q', q);
  }

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: upstreamUrl.toString(),
    errorContext: 'Failed to load knowledge articles from API',
  });
}

export async function POST(req: Request) {
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/articles`,
    errorContext: 'Failed to create knowledge article in API',
  });
}
