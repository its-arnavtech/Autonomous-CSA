import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { ticketId } = await params;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/tickets/${encodeURIComponent(ticketId)}/agent-steps`,
    errorContext: 'Failed to load ticket agent steps from API',
  });
}
