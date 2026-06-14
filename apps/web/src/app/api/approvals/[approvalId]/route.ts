import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

type RouteContext = {
  params: { approvalId: string } | Promise<{ approvalId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const { approvalId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/approvals/${encodeURIComponent(approvalId)}`;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl,
    errorContext: 'Failed to update approval decision',
  });
}
