import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { articleId: string } | Promise<{ articleId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { articleId } = await params;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}`,
    errorContext: 'Failed to load knowledge article from API',
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { articleId } = await params;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}`,
    errorContext: 'Failed to update knowledge article in API',
  });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { articleId } = await params;

  return proxyJsonRequest({
    req,
    method: 'DELETE',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/articles/${encodeURIComponent(articleId)}`,
    errorContext: 'Failed to archive knowledge article',
  });
}
