import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const { runId } = await context.params;
  return proxyJsonRequest({
    req,
    method: 'GET',
    errorContext: 'Failed to load run detail',
    upstreamUrl: `${getApiBaseUrl()}/operations/runs/${encodeURIComponent(runId)}${req.nextUrl.search}`,
  });
}
