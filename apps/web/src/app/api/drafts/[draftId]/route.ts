import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

type RouteContext = {
  params: { draftId: string } | Promise<{ draftId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const { draftId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/drafts/${encodeURIComponent(draftId)}`;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl,
    errorContext: 'Failed to update draft',
  });
}
