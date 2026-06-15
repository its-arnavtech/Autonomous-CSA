import { NextRequest } from 'next/server';
import { GET as exportAuditCsvRoute } from '../operations/audit/export/route';
import { POST as logoutRoute } from '../auth/logout/route';
import {
  CORRELATION_ID_HEADER,
  proxyJsonRequest,
} from './proxy';

describe('web proxy behavior', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api.internal';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  function createRequest(
    url: string,
    options?: {
      cookie?: string;
      correlationId?: string;
    },
  ) {
    return new NextRequest(url, {
      headers: {
        cookie:
          options?.cookie ??
          'au_access_token=access-token; au_refresh_token=refresh-token; au_organization_id=org_1',
        'user-agent': 'jest',
        'x-forwarded-for': '127.0.0.1',
        ...(options?.correlationId
          ? { [CORRELATION_ID_HEADER]: options.correlationId }
          : {}),
      },
    });
  }

  it('forwards auth, selected organization, and correlation ID server-side', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxyJsonRequest({
      req: createRequest('http://localhost/api/operations/summary', {
        correlationId: 'phase9-web-correlation-1234',
      }),
      upstreamUrl: 'http://api.internal/operations/summary',
      method: 'GET',
      errorContext: 'Failed to load operations summary',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    const headers = init.headers as Headers;

    expect(url).toBe('http://api.internal/operations/summary');
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('x-organization-id')).toBe('org_1');
    expect(headers.get(CORRELATION_ID_HEADER)).toBe(
      'phase9-web-correlation-1234',
    );
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(
      'phase9-web-correlation-1234',
    );
  });

  it('preserves one correlation ID across refresh retries', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'fresh-access',
            refreshToken: 'fresh-refresh',
            memberships: [{ organizationId: 'org_1' }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await proxyJsonRequest({
      req: createRequest('http://localhost/api/operations/runs'),
      upstreamUrl: 'http://api.internal/operations/runs',
      method: 'GET',
      errorContext: 'Failed to load operations runs',
    });

    const correlationIds = (global.fetch as jest.Mock).mock.calls.map(
      ([, init]) => (init.headers as Headers).get(CORRELATION_ID_HEADER),
    );

    expect(correlationIds[0]).toBeDefined();
    expect(correlationIds[0]).toBe(correlationIds[1]);
    expect(correlationIds[1]).toBe(correlationIds[2]);
  });

  it('sanitizes upstream failures instead of leaking upstream bodies', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'postgresql://postgres:secret@db.internal/app',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const response = await proxyJsonRequest({
      req: createRequest('http://localhost/api/operations/summary', {
        correlationId: 'phase9-proxy-error-1234',
      }),
      upstreamUrl: 'http://api.internal/operations/summary',
      method: 'GET',
      errorContext: 'Failed to load operations summary',
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load operations summary',
      correlationId: 'phase9-proxy-error-1234',
    });
  });

  it('clears auth cookies on logout', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    const response = await logoutRoute(
      createRequest('http://localhost/api/auth/logout', {
        correlationId: 'phase9-logout-correlation-1234',
      }),
    );

    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(
      'phase9-logout-correlation-1234',
    );
    expect(response.cookies.get('au_access_token')?.value).toBe('');
    expect(response.cookies.get('au_refresh_token')?.value).toBe('');
    expect(response.cookies.get('au_organization_id')?.value).toBe('');
  });

  it('preserves safe CSV headers through the export proxy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response('header\nvalue\n', {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="operations-audit.csv"',
          [CORRELATION_ID_HEADER]: 'phase9-csv-correlation-1234',
        },
      }),
    );

    const response = await exportAuditCsvRoute(
      createRequest('http://localhost/api/operations/audit/export', {
        correlationId: 'phase9-csv-correlation-1234',
      }),
    );

    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="operations-audit.csv"',
    );
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(
      'phase9-csv-correlation-1234',
    );
  });
});
