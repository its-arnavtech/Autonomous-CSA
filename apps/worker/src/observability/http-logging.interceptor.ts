import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { getCorrelationContext, startTimer } from '@agentic-support/observability';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';
import { workerLogger } from './worker-logger';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const route = request.route?.path ?? request.path ?? request.url ?? 'unknown';
    const method = request.method ?? 'GET';
    const stopTimer = startTimer();
    const stopActiveRequest = this.metrics.startHttpRequest(method, route);

    return next.handle().pipe(
      finalize(() => {
        stopActiveRequest();
        const durationMs = stopTimer();
        const statusCode = response.statusCode ?? 500;
        this.metrics.recordHttpRequest({
          method,
          route,
          statusCode,
          durationMs,
        });

        workerLogger
          .child({
            ...(getCorrelationContext() ?? {}),
            route,
            method,
            statusCode,
            durationMs,
          })
          .info('Worker HTTP request completed');
      }),
    );
  }
}
