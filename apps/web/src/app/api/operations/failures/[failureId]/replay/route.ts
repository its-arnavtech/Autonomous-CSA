import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../../_utils/proxy';

type RouteContext = {
  params: Promise<{ failureId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const { failureId } = await context.params;
  return proxyJsonRequest({
    req,
    method: 'POST',
    errorContext: 'Failed to replay failure',
    upstreamUrl: `${getApiBaseUrl()}/operations/failures/${encodeURIComponent(failureId)}/replay${req.nextUrl.search}`,
  });
}
