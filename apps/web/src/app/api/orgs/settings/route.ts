import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export async function GET(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: `${getApiBaseUrl()}/orgs/settings`,
    errorContext: 'Failed to load organization settings from API',
  });
}

export async function PATCH(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'PATCH',
    upstreamUrl: `${getApiBaseUrl()}/orgs/settings`,
    errorContext: 'Failed to update organization settings',
  });
}
