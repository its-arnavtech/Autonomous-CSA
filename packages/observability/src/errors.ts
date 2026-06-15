import { HttpException, HttpStatus } from '@nestjs/common';
import { sanitizeForLog } from './redaction';

export type SerializedError = {
  errorCode: string;
  errorName: string;
  message: string;
  statusCode?: number;
  stack?: string;
  cause?: unknown;
};

function normalizeMessage(message: string) {
  return (sanitizeForLog(message) as string) || 'Unexpected error';
}

export function getErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    return HttpStatus[error.getStatus()] ?? 'HTTP_EXCEPTION';
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) {
      return code;
    }
  }

  if (error instanceof Error && error.name) {
    return error.name.toUpperCase();
  }

  return 'INTERNAL_ERROR';
}

export function serializeError(
  error: unknown,
  options?: { includeStack?: boolean },
): SerializedError {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'object' &&
      response != null &&
      'message' in response &&
      typeof (response as { message?: unknown }).message === 'string'
        ? (response as { message: string }).message
        : error.message;

    return {
      errorCode: getErrorCode(error),
      errorName: error.name,
      message: normalizeMessage(message),
      statusCode: error.getStatus(),
      stack: options?.includeStack ? error.stack : undefined,
      cause:
        options?.includeStack && error.cause
          ? sanitizeForLog(error.cause)
          : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: getErrorCode(error),
      errorName: error.name,
      message: normalizeMessage(error.message),
      stack: options?.includeStack ? error.stack : undefined,
      cause:
        options?.includeStack && error.cause
          ? sanitizeForLog(error.cause)
          : undefined,
    };
  }

  return {
    errorCode: 'INTERNAL_ERROR',
    errorName: 'UnknownError',
    message: normalizeMessage(String(error)),
  };
}
