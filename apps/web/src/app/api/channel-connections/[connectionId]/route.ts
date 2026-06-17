import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/channel-connections/${encodeURIComponent(connectionId)}`,
    errorContext: 'Failed to load channel connection from API',
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/channel-connections/${encodeURIComponent(connectionId)}`,
    errorContext: 'Failed to update channel connection in API',
  });
}
