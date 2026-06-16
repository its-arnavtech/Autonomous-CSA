import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const email = __ENV.LOGIN_EMAIL || 'demo.owner@example.com';
const password = __ENV.LOGIN_PASSWORD || 'DemoPassword123!';
const includeCreateTicket = (__ENV.INCLUDE_CREATE_TICKET || 'true') === 'true';
const includeRefresh = (__ENV.INCLUDE_REFRESH || 'true') === 'true';
const createCustomerEmail =
  __ENV.CREATE_TICKET_CUSTOMER_EMAIL || 'loadtest.customer@example.com';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

function authHeaders(accessToken, organizationId) {
  return {
    authorization: `Bearer ${accessToken}`,
    'x-organization-id': organizationId,
    'content-type': 'application/json',
  };
}

function login() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );

  check(response, {
    'login status is 200': (res) => res.status === 200,
  });

  const payload = response.json();
  return {
    accessToken: payload?.accessToken,
    refreshToken: payload?.refreshToken,
    organizationId: payload?.memberships?.[0]?.organizationId,
  };
}

function refresh(refreshToken) {
  const response = http.post(
    `${baseUrl}/api/auth/refresh`,
    JSON.stringify({ refreshToken }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );

  check(response, {
    'refresh status is 200': (res) => res.status === 200,
  });

  const payload = response.json();
  return {
    accessToken: payload?.accessToken,
    refreshToken: payload?.refreshToken,
  };
}

function createTicket(headers) {
  const response = http.post(
    `${baseUrl}/api/tickets`,
    JSON.stringify({
      subject: `Load test ticket ${Date.now()}`,
      body: 'Please help with a deterministic load-testing scenario.',
      customerEmail: createCustomerEmail,
      customerName: 'Load Test Customer',
    }),
    { headers },
  );

  check(response, {
    'create ticket status is 201 or 200': (res) =>
      res.status === 201 || res.status === 200,
  });

  return response.json()?.ticketId;
}

export default function () {
  const session = login();
  check(session, {
    'login returned access token': (value) => Boolean(value?.accessToken),
    'login returned refresh token': (value) => Boolean(value?.refreshToken),
    'login returned membership': (value) => Boolean(value?.organizationId),
  });

  if (!session.accessToken || !session.refreshToken || !session.organizationId) {
    return;
  }

  let accessToken = session.accessToken;
  let refreshToken = session.refreshToken;
  const organizationId = session.organizationId;
  let ticketId = __ENV.TICKET_ID || null;

  if (includeRefresh) {
    const refreshed = refresh(refreshToken);
    accessToken = refreshed.accessToken || accessToken;
    refreshToken = refreshed.refreshToken || refreshToken;
  }

  const headers = authHeaders(accessToken, organizationId);

  if (includeCreateTicket) {
    ticketId = createTicket(headers) || ticketId;
  }

  const requests = [
    ['GET', `${baseUrl}/api/tickets`, null],
    [
      'GET',
      ticketId ? `${baseUrl}/api/tickets/${ticketId}` : null,
      null,
    ],
    ['GET', `${baseUrl}/api/operations/summary`, null],
    [
      'POST',
      `${baseUrl}/api/knowledge/search`,
      JSON.stringify({ query: 'refund policy' }),
    ],
  ];

  for (const [method, url, body] of requests) {
    if (!url) {
      continue;
    }

    const response = method === 'POST'
      ? http.post(url, body, { headers })
      : http.get(url, { headers });

    check(response, {
      [`${method} ${url} status < 500`]: (res) => res.status < 500,
    });
    sleep(1);
  }

  http.post(
    `${baseUrl}/api/auth/logout`,
    JSON.stringify({ refreshToken }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
}
