import { NextRequest } from 'next/server';
import { getApiBaseUrl, proxyJsonRequest } from '../../../_utils/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ outboundMessageId: string }> },
) {
  const { outboundMessageId } = await params;
  return proxyJsonRequest({
    req,
    method: 'POST',
    upstreamUrl: `${getApiBaseUrl()}/outbound-messages/${encodeURIComponent(outboundMessageId)}/replay`,
    errorContext: 'Failed to replay outbound message in API',
  });
}
