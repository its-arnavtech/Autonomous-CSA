import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../../_utils/proxy';

type RouteContext = {
  params: Promise<{ failureId: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { failureId } = await context.params;
  return proxyJsonRequest({
    req,
    method: 'PATCH',
    errorContext: 'Failed to resolve failure',
    upstreamUrl: `${getApiBaseUrl()}/operations/failures/${encodeURIComponent(failureId)}/resolve${req.nextUrl.search}`,
  });
}
