import { Controller, Get, Headers, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  bindCorrelationContext,
  CORRELATION_ID_HEADER,
} from '@agentic-support/observability';
import request from 'supertest';
import { ApiExceptionFilter } from './api-exception.filter';
import { MetricsService } from './metrics.service';

@Controller()
class Phase9ObservabilityTestController {
  @Get('echo')
  echo(@Headers(CORRELATION_ID_HEADER) correlationId: string) {
    return { correlationId };
  }

  @Get('boom')
  boom() {
    throw new Error('postgresql://user:secret@db.example.internal/app');
  }
}

describe('Phase 9 API observability', () => {
  let app: INestApplication;

  beforeEach(async () => {
    MetricsService.resetForTests();

    const moduleRef = await Test.createTestingModule({
      controllers: [Phase9ObservabilityTestController],
      providers: [MetricsService, ApiExceptionFilter],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req, res, next) => bindCorrelationContext(req, res, next));
    app.useGlobalFilters(app.get(ApiExceptionFilter));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    MetricsService.resetForTests();
  });

  it('generates a correlation ID when one is not supplied', async () => {
    const response = await request(app.getHttpServer()).get('/echo').expect(200);

    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(
      /^[a-z0-9-]{36}$/i,
    );
    expect(response.body.correlationId).toBe(
      response.headers[CORRELATION_ID_HEADER],
    );
  });

  it('preserves a valid incoming correlation ID', async () => {
    const correlationId = 'phase9-correlation-1234';
    const response = await request(app.getHttpServer())
      .get('/echo')
      .set(CORRELATION_ID_HEADER, correlationId)
      .expect(200);

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(correlationId);
    expect(response.body.correlationId).toBe(correlationId);
  });

  it('replaces invalid or oversized correlation IDs consistently', async () => {
    const oversized = 'x'.repeat(300);
    const response = await request(app.getHttpServer())
      .get('/echo')
      .set(CORRELATION_ID_HEADER, oversized)
      .expect(200);

    expect(response.headers[CORRELATION_ID_HEADER]).not.toBe(oversized);
    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(
      /^[a-z0-9-]{36}$/i,
    );
    expect(response.body.correlationId).toBe(
      response.headers[CORRELATION_ID_HEADER],
    );
  });

  it('includes the correlation ID on exception responses', async () => {
    const correlationId = 'phase9-error-correlation-1234';
    const response = await request(app.getHttpServer())
      .get('/boom')
      .set(CORRELATION_ID_HEADER, correlationId)
      .expect(500);

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(correlationId);
    expect(response.body.correlationId).toBe(correlationId);
    expect(response.body.message).toBe('Internal server error');
  });
});
