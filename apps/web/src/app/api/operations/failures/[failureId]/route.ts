import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: Promise<{ failureId: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const { failureId } = await context.params;
  return proxyJsonRequest({
    req,
    method: 'GET',
    errorContext: 'Failed to load failure detail',
    upstreamUrl: `${getApiBaseUrl()}/operations/failures/${encodeURIComponent(failureId)}${req.nextUrl.search}`,
  });
}
