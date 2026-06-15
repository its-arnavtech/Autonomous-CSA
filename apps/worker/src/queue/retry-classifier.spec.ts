import {
  classifyRetryableError,
  createConfigurationError,
} from './retry-classifier';

describe('retry classifier', () => {
  it('classifies retryable transient failures', () => {
    const result = classifyRetryableError(new Error('OpenAI API error 503: upstream down'));

    expect(result.disposition).toBe('RETRYABLE');
    expect(result.retryable).toBe(true);
    expect(result.metricOutcome).toBe('timeout');
  });

  it('classifies bounded rate limits as retryable', () => {
    const result = classifyRetryableError(new Error('429 too many requests'));

    expect(result.disposition).toBe('RETRYABLE');
    expect(result.metricOutcome).toBe('rate_limited');
  });

  it('classifies validation failures as non-retryable', () => {
    const result = classifyRetryableError(
      new Error('schema validation failed for malformed persisted data'),
    );

    expect(result.disposition).toBe('NON_RETRYABLE');
    expect(result.retryable).toBe(false);
    expect(result.useUnrecoverableError).toBe(true);
  });

  it('classifies blocked outcomes without dead-lettering', () => {
    const result = classifyRetryableError(new Error('guardrail block triggered'));

    expect(result.disposition).toBe('BLOCKED');
    expect(result.retryable).toBe(false);
    expect(result.shouldDeadLetter).toBe(false);
  });

  it('classifies configuration errors safely and visibly', () => {
    const result = classifyRetryableError(
      createConfigurationError('Invalid LLM_PRICING_JSON: expected object'),
    );

    expect(result.disposition).toBe('CONFIGURATION_ERROR');
    expect(result.metricOutcome).toBe('configuration_error');
    expect(result.useUnrecoverableError).toBe(true);
  });

  it('treats invalid provider credentials as configuration errors', () => {
    const result = classifyRetryableError(
      new Error('OpenAI API error 401: invalid_api_key'),
    );

    expect(result.disposition).toBe('CONFIGURATION_ERROR');
    expect(result.retryable).toBe(false);
    expect(result.metricOutcome).toBe('configuration_error');
  });
});
