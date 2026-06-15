import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../_utils/proxy';

export async function GET(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/tickets`,
    errorContext: 'Failed to load tickets from API',
  });
}

export async function POST(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/tickets`,
    errorContext: 'Failed to create ticket in API',
  });
}
