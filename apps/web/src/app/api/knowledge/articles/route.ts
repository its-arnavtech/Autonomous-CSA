import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../_utils/proxy';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const upstreamUrl = new URL(`${getApiBaseUrl()}/knowledge/articles`);
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q');

  if (status) {
    upstreamUrl.searchParams.set('status', status);
  }

  if (q) {
    upstreamUrl.searchParams.set('q', q);
  }

  return proxyJsonRequest({
    req,
    method: 'GET',
    upstreamUrl: upstreamUrl.toString(),
    errorContext: 'Failed to load knowledge articles from API',
  });
}

export async function POST(req: NextRequest) {
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/knowledge/articles`,
    errorContext: 'Failed to create knowledge article in API',
  });
}
