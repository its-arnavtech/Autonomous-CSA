import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../_utils/proxy';

export async function GET(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/channel-connections`,
    errorContext: 'Failed to load channel connections from API',
  });
}

export async function POST(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/channel-connections`,
    errorContext: 'Failed to create channel connection in API',
  });
}
