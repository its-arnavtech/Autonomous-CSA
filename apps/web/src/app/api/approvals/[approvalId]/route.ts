import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

type RouteContext = {
  params: { approvalId: string } | Promise<{ approvalId: string }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { approvalId } = await params;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/approvals/${encodeURIComponent(approvalId)}`,
    errorContext: 'Failed to update approval',
  });
}
