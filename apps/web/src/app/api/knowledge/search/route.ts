import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export async function POST(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/search`,
    errorContext: 'Failed to search knowledge articles',
  });
}
