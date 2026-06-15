import { serializeError } from '@agentic-support/observability';

export type RetryDisposition =
  | 'RETRYABLE'
  | 'NON_RETRYABLE'
  | 'BLOCKED'
  | 'CONFIGURATION_ERROR';

export type RetryClassification = {
  disposition: RetryDisposition;
  metricOutcome:
    | 'blocked'
    | 'configuration_error'
    | 'provider_error'
    | 'rate_limited'
    | 'timeout'
    | 'unknown'
    | 'validation_error';
  retryable: boolean;
  shouldDeadLetter: boolean;
  useUnrecoverableError: boolean;
  serialized: ReturnType<typeof serializeError>;
};

function includesAny(message: string, patterns: string[]) {
  return patterns.some((pattern) => message.includes(pattern));
}

function getHaystack(error: ReturnType<typeof serializeError>) {
  return `${error.errorCode} ${error.errorName} ${error.message}`.toLowerCase();
}

export function createConfigurationError(message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = 'CONFIGURATION_ERROR';
  return error;
}

export function classifyRetryableError(error: unknown): RetryClassification {
  const serialized = serializeError(error);
  const haystack = getHaystack(serialized);

  if (
    includesAny(haystack, [
      'guardrail block',
      'guardrail_block',
      'critic block',
      'critic_block',
      'policy rejection',
      'policy_rejection',
    ])
  ) {
    return {
      disposition: 'BLOCKED',
      metricOutcome: 'blocked',
      retryable: false,
      shouldDeadLetter: false,
      useUnrecoverableError: false,
      serialized,
    };
  }

  if (
    includesAny(haystack, [
      'configuration_error',
      'invalid ai_provider',
      'invalid provider configuration',
      'invalid llm_pricing_json',
      'invalid_api_key',
      'invalid api key',
      'incorrect api key',
      'unauthorized',
      'authentication failed',
      'missing production secret',
      'missing ai_api_key',
      'malformed required env',
      'unsupported provider',
    ])
  ) {
    return {
      disposition: 'CONFIGURATION_ERROR',
      metricOutcome: 'configuration_error',
      retryable: false,
      shouldDeadLetter: true,
      useUnrecoverableError: true,
      serialized,
    };
  }

  if (
    includesAny(haystack, [
      'badrequest',
      'validation',
      'schema',
      'missing ticket',
      'ticket not found',
      'tenant mismatch',
      'invalid organization',
      'malformed persisted data',
      'unsupported payload',
      'notfound',
      'conflict',
    ])
  ) {
    return {
      disposition: 'NON_RETRYABLE',
      metricOutcome: 'validation_error',
      retryable: false,
      shouldDeadLetter: true,
      useUnrecoverableError: true,
      serialized,
    };
  }

  if (includesAny(haystack, ['429', 'rate limit', 'too many requests'])) {
    return {
      disposition: 'RETRYABLE',
      metricOutcome: 'rate_limited',
      retryable: true,
      shouldDeadLetter: true,
      useUnrecoverableError: false,
      serialized,
    };
  }

  if (
    includesAny(haystack, [
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'enotfound',
      'socket hang up',
      'temporary network failure',
      'temporary provider outage',
      'postgres',
      'redis',
      '502',
      '503',
      '504',
    ])
  ) {
    return {
      disposition: 'RETRYABLE',
      metricOutcome: 'timeout',
      retryable: true,
      shouldDeadLetter: true,
      useUnrecoverableError: false,
      serialized,
    };
  }

  if (includesAny(haystack, ['openai api error', 'anthropic api error'])) {
    return {
      disposition: 'RETRYABLE',
      metricOutcome: 'provider_error',
      retryable: true,
      shouldDeadLetter: true,
      useUnrecoverableError: false,
      serialized,
    };
  }

  return {
    disposition: 'RETRYABLE',
    metricOutcome: 'unknown',
    retryable: true,
    shouldDeadLetter: true,
    useUnrecoverableError: false,
    serialized,
  };
}
