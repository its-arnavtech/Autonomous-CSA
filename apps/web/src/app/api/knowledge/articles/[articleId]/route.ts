import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params:
    | { articleId: string }
    | Promise<{ articleId: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const { articleId } = await params;
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';
  const upstreamUrl = `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}?orgId=${encodeURIComponent(orgId)}`;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl,
    errorContext: 'Failed to load knowledge article from API',
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { articleId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}`;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl,
    errorContext: 'Failed to update knowledge article in API',
  });
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const { articleId } = await params;
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';
  const upstreamUrl = `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}?orgId=${encodeURIComponent(orgId)}`;

  return proxyJsonRequest({
    req,
    method: 'DELETE',
    upstreamUrl,
    errorContext: 'Failed to archive knowledge article in API',
  });
}
