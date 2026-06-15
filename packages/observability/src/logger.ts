import type { LoggerService, LogLevel } from '@nestjs/common';
import { getCorrelationContext, type CorrelationContext } from './correlation';
import { serializeError } from './errors';
import { sanitizeForLog } from './redaction';

export type StructuredLogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace';

export type StructuredLogFields = Partial<CorrelationContext> & {
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  errorName?: string;
};

function getConfiguredLevel() {
  return (process.env.LOG_LEVEL?.trim().toLowerCase() || 'info') as LogLevel;
}

function shouldPrettyPrint() {
  if (process.env.LOG_PRETTY?.trim().toLowerCase() === 'true') {
    return true;
  }

  if (process.env.LOG_FORMAT?.trim().toLowerCase() === 'pretty') {
    return true;
  }

  return process.env.NODE_ENV !== 'production';
}

function canLog(level: StructuredLogLevel) {
  const priorities: Record<StructuredLogLevel, number> = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  };

  const configured = getConfiguredLevel();
  const normalized =
    configured === 'log'
      ? 'info'
      : configured === 'verbose'
        ? 'debug'
        : (configured as StructuredLogLevel);

  return priorities[level] <= priorities[normalized ?? 'info'];
}

function formatRecord(record: Record<string, unknown>) {
  if (!shouldPrettyPrint()) {
    return JSON.stringify(record);
  }

  const { level, service, message, ...rest } = record;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `[${String(level).toUpperCase()}] ${service}: ${message}${extra}`;
}

export class StructuredLogger implements LoggerService {
  constructor(private readonly service: string) {}

  info(message: unknown, fields?: unknown) {
    this.write('info', message, fields);
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('info', message, fields, error);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('error', message, fields, error);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('warn', message, fields, error);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('debug', message, fields, error);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('trace', message, fields, error);
  }

  fatal?(message: unknown, ...optionalParams: unknown[]) {
    const { fields, error } = this.parseFieldsAndError(optionalParams);
    this.write('fatal', message, fields, error);
  }

  child(fields: StructuredLogFields) {
    return {
      info: (message: string, extra?: Record<string, unknown>) =>
        this.write('info', message, { ...fields, ...extra }),
      warn: (message: string, extra?: Record<string, unknown>) =>
        this.write('warn', message, { ...fields, ...extra }),
      error: (
        message: string,
        error?: unknown,
        extra?: Record<string, unknown>,
      ) => this.write('error', message, { ...fields, ...extra }, error),
      debug: (message: string, extra?: Record<string, unknown>) =>
        this.write('debug', message, { ...fields, ...extra }),
    };
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    fields?: unknown,
    error?: unknown,
  ) {
    if (!canLog(level)) {
      return;
    }

    const context = getCorrelationContext();
    const serializedError =
      error != null
        ? serializeError(error, {
            includeStack: process.env.NODE_ENV !== 'production',
          })
        : undefined;

    const record = sanitizeForLog({
      service: this.service,
      environment: process.env.NODE_ENV ?? 'development',
      level,
      timestamp: new Date().toISOString(),
      message:
        typeof message === 'string' ? message : JSON.stringify(sanitizeForLog(message)),
      ...(context ?? {}),
      ...(typeof fields === 'object' && fields != null
        ? (fields as Record<string, unknown>)
        : {}),
      ...(serializedError ?? {}),
    }) as Record<string, unknown>;

    const formatted = formatRecord(record);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${formatted}\n`);
      return;
    }

    process.stdout.write(`${formatted}\n`);
  }

  private parseFieldsAndError(optionalParams: unknown[]) {
    if (optionalParams[0] instanceof Error) {
      return {
        error: optionalParams[0],
        fields: optionalParams[1],
      };
    }

    if (optionalParams[1] instanceof Error) {
      return {
        fields: optionalParams[0],
        error: optionalParams[1],
      };
    }

    return {
      fields: optionalParams[0],
      error: undefined,
    };
  }
}
