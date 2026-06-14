import { NextResponse } from 'next/server';

export function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? 'http://localhost:3001';
}

export async function proxyJsonRequest(params: {
  req: Request;
  upstreamUrl: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  errorContext: string;
}) {
  try {
    const upstream = await fetch(params.upstreamUrl, {
      method: params.method,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers:
        params.method === 'GET' || params.method === 'DELETE'
          ? undefined
          : { 'content-type': 'application/json' },
      body:
        params.method === 'GET' || params.method === 'DELETE'
          ? undefined
          : await params.req.text(),
    });
    const body = await upstream.text();

    if (!upstream.ok) {
      console.error('[proxy] upstream error', {
        context: params.errorContext,
        url: params.upstreamUrl,
        status: upstream.status,
        body,
      });
      return NextResponse.json(
        { error: params.errorContext },
        { status: upstream.status },
      );
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('[proxy] network error', {
      context: params.errorContext,
      url: params.upstreamUrl,
      error,
    });
    return NextResponse.json(
      { error: params.errorContext },
      { status: 502 },
    );
  }
}
