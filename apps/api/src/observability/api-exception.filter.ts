import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  getCorrelationContext,
  serializeError,
} from '@agentic-support/observability';
import type { Response } from 'express';
import { apiLogger } from './api-logger';
import { MetricsService } from './metrics.service';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly metrics: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest();
    const correlation = getCorrelationContext();
    const serialized = serializeError(exception, {
      includeStack: process.env.NODE_ENV !== 'production',
    });
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorLabel =
      exception instanceof HttpException
        ? exception.name.replace(/Exception$/, '')
        : 'InternalServerError';
    const clientMessage =
      statusCode >= 500 ? 'Internal server error' : serialized.message;

    if (exception instanceof UnauthorizedException) {
      this.metrics.incrementAuthFailure('access', 'auth_error');
    }

    if (exception instanceof ForbiddenException) {
      this.metrics.incrementAuthorizationDenied();
      this.metrics.incrementAuthFailure(
        'authorization',
        'authorization_denied',
      );
    }

    apiLogger.child({
      ...(correlation ?? {}),
      route: request.route?.path ?? request.path ?? request.url,
      method: request.method,
      statusCode,
      errorCode: serialized.errorCode,
      errorName: serialized.errorName,
    }).error('HTTP request failed', exception);

    response
      .status(statusCode)
      .setHeader(
        'x-correlation-id',
        correlation?.correlationId ?? request.headers['x-correlation-id'] ?? '',
      )
      .json({
        statusCode,
        error: errorLabel,
        message: clientMessage,
        correlationId:
          correlation?.correlationId ?? request.headers['x-correlation-id'] ?? null,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
      });
  }
}
