import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export function GET(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'GET',
    errorContext: 'Failed to load operations summary',
    upstreamUrl: `${getApiBaseUrl()}/operations/summary${req.nextUrl.search}`,
  });
}
