import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const { ticketId } = await params;
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';
  const upstreamUrl = `${getApiBaseUrl()}/tickets/${encodeURIComponent(ticketId)}/drafts?orgId=${encodeURIComponent(orgId)}`;

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl,
    errorContext: 'Failed to load ticket drafts from API',
  });
}

export async function POST(req: Request, { params }: RouteContext) {
  const { ticketId } = await params;
  const upstreamUrl = `${getApiBaseUrl()}/tickets/${encodeURIComponent(ticketId)}/drafts`;

  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl,
    errorContext: 'Failed to create draft',
  });
}
