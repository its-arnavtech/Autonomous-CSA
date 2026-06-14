import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { draftId: string } | Promise<{ draftId: string }>;
};

export async function POST(req: Request, { params }: RouteContext) {
  const { draftId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/drafts/${encodeURIComponent(draftId)}/send`;

  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl,
    errorContext: 'Failed to send draft',
  });
}
