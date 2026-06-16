import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 3),
  duration: __ENV.K6_DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
  },
};

const apiUrl = (__ENV.STAGING_API_URL || '').replace(/\/$/, '');
const email = __ENV.STAGING_SMOKE_EMAIL;
const password = __ENV.STAGING_SMOKE_PASSWORD;

export default function () {
  if (!apiUrl || !email || !password) {
    throw new Error('STAGING_API_URL, STAGING_SMOKE_EMAIL, and STAGING_SMOKE_PASSWORD are required');
  }

  const login = http.post(
    `${apiUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'content-type': 'application/json' } },
  );
  check(login, { 'login ok': (res) => res.status === 201 || res.status === 200 });

  const auth = login.json();
  const organizationId = auth.memberships?.[0]?.organizationId;
  const headers = {
    authorization: `Bearer ${auth.accessToken}`,
    'x-organization-id': organizationId,
    'content-type': 'application/json',
  };

  check(http.get(`${apiUrl}/tickets`, { headers }), {
    'ticket list ok': (res) => res.status === 200,
  });
  check(http.get(`${apiUrl}/operations/summary`, { headers }), {
    'operations summary ok': (res) => res.status === 200,
  });
  check(
    http.post(`${apiUrl}/knowledge/search`, JSON.stringify({ query: 'login', limit: 5 }), { headers }),
    { 'knowledge search ok': (res) => res.status === 201 || res.status === 200 },
  );

  const create = http.post(
    `${apiUrl}/tickets`,
    JSON.stringify({
      subject: `k6 staging ${Date.now()}`,
      body: 'Bounded staging load-test ticket.',
      customerEmail: `k6-${Date.now()}@example.test`,
      customerName: 'K6 Smoke',
      priority: 'NORMAL',
    }),
    { headers },
  );
  check(create, { 'ticket create ok': (res) => res.status === 201 || res.status === 200 });
  const ticketId = create.json('ticketId');
  if (ticketId) {
    check(http.get(`${apiUrl}/tickets/${ticketId}`, { headers }), {
      'ticket detail ok': (res) => res.status === 200,
    });
  }

  http.post(
    `${apiUrl}/auth/refresh`,
    JSON.stringify({ refreshToken: auth.refreshToken }),
    { headers: { 'content-type': 'application/json' } },
  );
  sleep(1);
}
