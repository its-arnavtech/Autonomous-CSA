import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const { ticketId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/tickets/${encodeURIComponent(ticketId)}/priority`;

  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl,
    errorContext: 'Failed to update ticket priority',
  });
}
