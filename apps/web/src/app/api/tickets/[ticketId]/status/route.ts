import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { ticketId } = await params;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/tickets/${encodeURIComponent(ticketId)}/status`,
    errorContext: 'Failed to update ticket status',
  });
}
