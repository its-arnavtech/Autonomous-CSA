import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_MAX_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9:/_.-]{8,128}$/;

export type CorrelationContext = {
  correlationId: string;
  requestId?: string;
  service?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  jobId?: string;
  jobName?: string;
  runId?: string;
  ticketId?: string;
  stepId?: string;
  organizationId?: string;
  userId?: string;
  retryAttempt?: number;
  provider?: string;
  model?: string;
};

type CorrelationRequest = {
  headers: Record<string, unknown>;
  method?: string;
  path?: string;
};

type CorrelationResponse = {
  setHeader(name: string, value: string): void;
};

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function createCorrelationId() {
  return randomUUID();
}

export function normalizeCorrelationId(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CORRELATION_ID_MAX_LENGTH) {
    return null;
  }

  return CORRELATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function ensureCorrelationId(value?: string | null) {
  return normalizeCorrelationId(value) ?? createCorrelationId();
}

export function runWithCorrelationContext<T>(
  context: CorrelationContext,
  callback: () => T,
) {
  return correlationStorage.run(context, callback);
}

export function getCorrelationContext() {
  return correlationStorage.getStore() ?? null;
}

export function mergeCorrelationContext(partial: Partial<CorrelationContext>) {
  const current = getCorrelationContext();
  if (!current) {
    return null;
  }

  const next = { ...current, ...partial };
  correlationStorage.enterWith(next);
  return next;
}

export function extractCorrelationId(
  headers:
    | Headers
    | {
        get(name: string): string | null | undefined;
      },
) {
  return ensureCorrelationId(headers.get(CORRELATION_ID_HEADER));
}

export function bindCorrelationContext(
  request: CorrelationRequest,
  response: CorrelationResponse,
  next: () => void,
) {
  const correlationId = ensureCorrelationId(
    typeof request.headers[CORRELATION_ID_HEADER] === 'string'
      ? (request.headers[CORRELATION_ID_HEADER] as string)
      : undefined,
  );

  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  request.headers[CORRELATION_ID_HEADER] = correlationId;

  return runWithCorrelationContext(
    {
      correlationId,
      requestId: correlationId,
      method: request.method,
      route: request.path,
    },
    next,
  );
}
