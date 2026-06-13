import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  { params }: { params: { ticketId: string } }
) {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3001';
  const url = new URL(req.url);
  const orgId = url.searchParams.get('orgId') ?? 'org_demo';

  const upstream = await fetch(
    `${apiBase}/tickets/${params.ticketId}/timeline?orgId=${encodeURIComponent(orgId)}`,
    { cache: 'no-store' }
  );

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
