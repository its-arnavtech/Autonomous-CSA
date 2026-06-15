import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  getCorrelationContext,
  serializeError,
} from '@agentic-support/observability';
import type { Response } from 'express';
import { workerLogger } from './worker-logger';

@Catch()
export class WorkerExceptionFilter implements ExceptionFilter {
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

    workerLogger
      .child({
        ...(correlation ?? {}),
        route: request.route?.path ?? request.path ?? request.url,
        method: request.method,
        statusCode,
        errorCode: serialized.errorCode,
        errorName: serialized.errorName,
      })
      .error('Worker HTTP request failed', exception);

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
