import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

type RouteContext = {
  params: { draftId: string } | Promise<{ draftId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { draftId } = await params;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/drafts/${encodeURIComponent(draftId)}`,
    errorContext: 'Failed to load draft from API',
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { draftId } = await params;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/drafts/${encodeURIComponent(draftId)}`,
    errorContext: 'Failed to update draft',
  });
}
