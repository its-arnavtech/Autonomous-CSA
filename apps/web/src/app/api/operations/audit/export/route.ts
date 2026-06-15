import { NextRequest, NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  fetchAuthenticatedJson,
  getApiBaseUrl,
} from '../../../_utils/proxy';

export async function GET(req: NextRequest) {
  const result = await fetchAuthenticatedJson(
    req,
    `${getApiBaseUrl()}/operations/audit/export${req.nextUrl.search}`,
    {
      requireOrganization: true,
    },
  );

  if ('response' in result && result.response) {
    return result.response;
  }

  const body = await result.upstreamResponse.text();
  const response = new NextResponse(body, {
    status: result.upstreamResponse.status,
  });
  response.headers.set(
    'content-type',
    result.upstreamResponse.headers.get('content-type') ?? 'text/csv',
  );
  const contentDisposition = result.upstreamResponse.headers.get(
    'content-disposition',
  );
  if (contentDisposition) {
    response.headers.set('content-disposition', contentDisposition);
  }
  response.headers.set(
    CORRELATION_ID_HEADER,
    result.upstreamResponse.headers.get(CORRELATION_ID_HEADER) ??
      req.headers.get(CORRELATION_ID_HEADER) ??
      '',
  );
  return response;
}
