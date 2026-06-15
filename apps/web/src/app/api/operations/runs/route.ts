import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export function GET(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'GET',
    errorContext: 'Failed to load operations runs',
    upstreamUrl: `${getApiBaseUrl()}/operations/runs${req.nextUrl.search}`,
  });
}
