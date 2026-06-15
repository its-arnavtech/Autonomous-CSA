import {
  calculateLlmCost,
  parseLlmPricingConfig,
  sumEstimatedCostCents,
} from './pricing';

describe('LLM pricing', () => {
  it('accepts valid config overrides', () => {
    const config = parseLlmPricingConfig(
      JSON.stringify({
        openai: {
          'gpt-4o-mini': {
            inputMicrounitsPer1kTokens: 200,
            outputMicrounitsPer1kTokens: 700,
          },
        },
      }),
    );

    const cost = calculateLlmCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: 1000,
      outputTokens: 500,
      pricing: config,
    });

    expect(cost).toEqual({
      estimatedCostMicrounits: 550,
      estimatedCostCents: 1,
    });
  });

  it('rejects invalid pricing config', () => {
    expect(() =>
      parseLlmPricingConfig(
        JSON.stringify({
          openai: { 'gpt-4o-mini': { inputMicrounitsPer1kTokens: -1 } },
        }),
      ),
    ).toThrow(/LLM_PRICING_JSON/);
  });

  it('computes deterministic provider cost as zero', () => {
    expect(
      calculateLlmCost({
        provider: 'deterministic',
        model: 'deterministic',
        inputTokens: 500,
        outputTokens: 250,
      }),
    ).toEqual({
      estimatedCostMicrounits: 0,
      estimatedCostCents: 0,
    });
  });

  it('returns null cost for unknown models while preserving token accounting elsewhere', () => {
    expect(
      calculateLlmCost({
        provider: 'openai',
        model: 'unknown-model',
        inputTokens: 500,
        outputTokens: 250,
      }),
    ).toEqual({
      estimatedCostMicrounits: null,
      estimatedCostCents: null,
    });
  });

  it('uses integer microunits without floating-point drift', () => {
    const cost = calculateLlmCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: 333,
      outputTokens: 777,
      pricing: parseLlmPricingConfig(
        JSON.stringify({
          openai: {
            'gpt-4o-mini': {
              inputMicrounitsPer1kTokens: 3,
              outputMicrounitsPer1kTokens: 7,
            },
          },
        }),
      ),
    });

    expect(cost.estimatedCostMicrounits).toBe(7);
    expect(cost.estimatedCostCents).toBe(1);
  });

  it('returns null aggregate when any step cost is unknown', () => {
    expect(sumEstimatedCostCents([1, null, 2])).toBeNull();
    expect(sumEstimatedCostCents([1, 2, 3])).toBe(6);
  });
});
