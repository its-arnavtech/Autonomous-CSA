import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { draftId: string } | Promise<{ draftId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { draftId } = await params;

  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/drafts/${encodeURIComponent(draftId)}/send`,
    errorContext: 'Failed to send draft',
  });
}
