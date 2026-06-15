import { MetricsService } from './metrics.service';

describe('Phase 9 API metrics', () => {
  beforeEach(() => {
    MetricsService.resetForTests();
  });

  afterEach(() => {
    MetricsService.resetForTests();
  });

  it('records HTTP and auth metrics without sensitive labels', async () => {
    const metrics = new MetricsService();

    const stopActive = metrics.startHttpRequest('GET', '/tickets');
    stopActive();
    metrics.recordHttpRequest({
      method: 'GET',
      route: '/tickets',
      statusCode: 200,
      durationMs: 42,
    });
    metrics.incrementAuthLogin('success');
    metrics.incrementAuthFailure('login', 'auth_error');
    metrics.incrementAuthRegistration('success');
    metrics.incrementAuthRefresh('auth_error');
    metrics.incrementAuthorizationDenied();
    metrics.incrementQueueEnqueued('ticket.process', 'ticket_created');
    metrics.incrementDraftCreated('user');
    metrics.incrementDraftSent('user');

    const rendered = await metrics.render();

    expect(rendered).toContain(
      'autonomous_http_requests_total{method="GET",route="/tickets",statusClass="2xx"} 1',
    );
    expect(rendered).toContain(
      'autonomous_auth_logins_total{outcome="success"} 1',
    );
    expect(rendered).toContain(
      'autonomous_auth_failures_total{flow="login",reason="auth_error"} 1',
    );
    expect(rendered).toContain('autonomous_authorization_denials_total 1');
    expect(rendered).toContain(
      'autonomous_queue_jobs_enqueued_total{jobName="ticket.process",trigger="ticket_created"} 1',
    );
    expect(rendered).toContain(
      'autonomous_drafts_created_total{source="user"} 1',
    );
    expect(rendered).toContain(
      'autonomous_drafts_sent_total{source="user"} 1',
    );
    expect(rendered).not.toContain('organizationId=');
    expect(rendered).not.toContain('ticketId=');
    expect(rendered).not.toContain('userId=');
    expect(rendered).not.toContain('correlationId=');
    expect(rendered).not.toContain('email=');
    expect(rendered).not.toContain('raw error message');
  });

  it('does not throw on duplicate registration and resets cleanly between tests', async () => {
    const first = new MetricsService();
    const second = new MetricsService();

    first.incrementAuthLogin('success');
    second.incrementAuthLogin('success');

    const rendered = await first.render();
    expect(rendered).toContain(
      'autonomous_auth_logins_total{outcome="success"} 2',
    );

    MetricsService.resetForTests();
    const reset = new MetricsService();
    const resetRendered = await reset.render();
    expect(resetRendered).not.toContain(
      'autonomous_auth_logins_total{outcome="success"} 2',
    );
  });
});
