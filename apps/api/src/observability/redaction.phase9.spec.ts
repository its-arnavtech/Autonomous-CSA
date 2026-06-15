import {
  runWithCorrelationContext,
  sanitizeForLog,
  serializeError,
  StructuredLogger,
} from '@agentic-support/observability';

describe('Phase 9 redaction and log safety', () => {
  it('redacts secrets and summarizes sensitive bodies while preserving safe metadata', () => {
    const sanitized = sanitizeForLog({
      authorization: 'Bearer secret-token',
      cookie: 'session=topsecret',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      password: 'hunter2',
      passwordHash: 'hash-value',
      tokenHash: 'token-hash',
      apiKey: 'sk-secret',
      jwt_access_secret: 'jwt-secret',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/app',
      prompt: 'Write a sensitive reply to the customer.',
      body: 'Customer body with credentials inside.',
      message: 'Raw customer message body.',
      safe: {
        errorCode: 'AUTH_ERROR',
        errorName: 'UnauthorizedException',
        reason: 'missing bearer token',
      },
    }) as Record<string, unknown>;

    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.refreshToken).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.passwordHash).toBe('[REDACTED]');
    expect(sanitized.tokenHash).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.jwt_access_secret).toBe('[REDACTED]');
    expect(sanitized.databaseUrl).toBe('[REDACTED]');
    expect(sanitized.prompt).toMatchObject({ redacted: true });
    expect(sanitized.body).toMatchObject({ redacted: true });
    expect(sanitized.message).toMatchObject({ redacted: true });
    expect(sanitized.safe).toMatchObject({
      errorCode: 'AUTH_ERROR',
      errorName: 'UnauthorizedException',
      reason: 'missing bearer token',
    });
  });

  it('only includes stack traces when explicitly requested', () => {
    const error = new Error('postgresql://user:secret@db.example.internal/app');
    const withoutStack = serializeError(error, { includeStack: false });
    const withStack = serializeError(error, { includeStack: true });

    expect(withoutStack.stack).toBeUndefined();
    expect(withoutStack.message).toBe('[REDACTED]');
    expect(withStack.stack).toContain('Error: postgresql://user:secret');
    expect(withStack.errorName).toBe('Error');
    expect(withStack.errorCode).toBe('ERROR');
  });

  it('writes structured logs with correlation IDs and without leaking credentials', () => {
    const logger = new StructuredLogger('phase9-test');
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    runWithCorrelationContext(
      { correlationId: 'phase9-log-correlation-1234' },
      () =>
        logger.info('Testing structured log', {
          authorization: 'Bearer secret',
          prompt: 'Send raw customer data',
          email: 'safe@example.com',
        }),
    );

    const logged = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(logged).toContain('phase9-log-correlation-1234');
    expect(logged).toContain('[REDACTED]');
    expect(logged).not.toContain('Bearer secret');
    expect(logged).not.toContain('Send raw customer data');

    stdoutSpy.mockRestore();
  });
});
