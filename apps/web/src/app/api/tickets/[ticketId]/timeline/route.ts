import { NextResponse } from 'next/server';

type RouteContext = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
};

export async function GET(
  req: Request,
  { params }: RouteContext,
) {
  const { ticketId } = await params;
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3001';
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';

  const upstreamUrl = `${apiBase}/tickets/${encodeURIComponent(ticketId)}/timeline?orgId=${encodeURIComponent(orgId)}`;

  try {
    const upstream = await fetch(upstreamUrl, { cache: 'no-store' });
    const body = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: 'Failed to load ticket timeline from API',
          status: upstream.status,
          statusText: upstream.statusText,
          upstreamUrl,
          upstreamBody: body,
        },
        { status: upstream.status },
      );
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to reach ticket timeline API',
        message: error instanceof Error ? error.message : String(error),
        upstreamUrl,
      },
      { status: 502 },
    );
  }
}
