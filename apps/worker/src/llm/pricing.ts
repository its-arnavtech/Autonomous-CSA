import { createConfigurationError } from '../queue/retry-classifier';

type PricingRate = {
  inputMicrounitsPer1kTokens: number;
  outputMicrounitsPer1kTokens: number;
};

export type LlmPricingConfig = Record<string, Record<string, PricingRate>>;

export type LlmCostResult = {
  estimatedCostMicrounits: number | null;
  estimatedCostCents: number | null;
};

const DEFAULT_LLM_PRICING: LlmPricingConfig = {
  openai: {
    'gpt-4o-mini': {
      inputMicrounitsPer1kTokens: 150,
      outputMicrounitsPer1kTokens: 600,
    },
  },
  anthropic: {
    'claude-haiku-4-5': {
      inputMicrounitsPer1kTokens: 250,
      outputMicrounitsPer1kTokens: 1250,
    },
  },
  deterministic: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRate(
  provider: string,
  model: string,
  value: unknown,
): PricingRate {
  if (!isPlainObject(value)) {
    throw createConfigurationError(
      `Invalid LLM_PRICING_JSON for ${provider}/${model}: expected object`,
    );
  }

  const input = value.inputMicrounitsPer1kTokens;
  const output = value.outputMicrounitsPer1kTokens;

  if (!Number.isInteger(input) || Number(input) < 0) {
    throw createConfigurationError(
      `Invalid LLM_PRICING_JSON for ${provider}/${model}: inputMicrounitsPer1kTokens must be a non-negative integer`,
    );
  }

  if (!Number.isInteger(output) || Number(output) < 0) {
    throw createConfigurationError(
      `Invalid LLM_PRICING_JSON for ${provider}/${model}: outputMicrounitsPer1kTokens must be a non-negative integer`,
    );
  }

  return {
    inputMicrounitsPer1kTokens: input as number,
    outputMicrounitsPer1kTokens: output as number,
  };
}

function mergePricingConfig(
  base: LlmPricingConfig,
  override: LlmPricingConfig,
): LlmPricingConfig {
  const next: LlmPricingConfig = { ...base };

  for (const [provider, models] of Object.entries(override)) {
    next[provider] = {
      ...(next[provider] ?? {}),
      ...models,
    };
  }

  return next;
}

function ceilDivide(numerator: number, denominator: number) {
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function parseLlmPricingConfig(
  raw = process.env.LLM_PRICING_JSON,
): LlmPricingConfig {
  if (!raw?.trim()) {
    return DEFAULT_LLM_PRICING;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createConfigurationError('Invalid LLM_PRICING_JSON: must be valid JSON');
  }

  if (!isPlainObject(parsed)) {
    throw createConfigurationError('Invalid LLM_PRICING_JSON: expected object');
  }

  const override: LlmPricingConfig = {};
  for (const [provider, models] of Object.entries(parsed)) {
    if (!isPlainObject(models)) {
      throw createConfigurationError(
        `Invalid LLM_PRICING_JSON for ${provider}: expected object of models`,
      );
    }

    override[provider] = {};
    for (const [model, value] of Object.entries(models)) {
      override[provider][model] = parseRate(provider, model, value);
    }
  }

  return mergePricingConfig(DEFAULT_LLM_PRICING, override);
}

export function calculateLlmCost(input: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  pricing?: LlmPricingConfig;
}): LlmCostResult {
  if (input.provider === 'deterministic') {
    return {
      estimatedCostMicrounits: 0,
      estimatedCostCents: 0,
    };
  }

  const pricing = input.pricing ?? parseLlmPricingConfig();
  const rate = pricing[input.provider]?.[input.model];

  if (!rate) {
    return {
      estimatedCostMicrounits: null,
      estimatedCostCents: null,
    };
  }

  const inputCostMicrounits = ceilDivide(
    input.inputTokens * rate.inputMicrounitsPer1kTokens,
    1000,
  );
  const outputCostMicrounits = ceilDivide(
    input.outputTokens * rate.outputMicrounitsPer1kTokens,
    1000,
  );
  const estimatedCostMicrounits = inputCostMicrounits + outputCostMicrounits;

  return {
    estimatedCostMicrounits,
    estimatedCostCents: ceilDivide(estimatedCostMicrounits, 10_000),
  };
}

export function sumEstimatedCostCents(
  values: Array<number | null | undefined>,
): number | null {
  if (values.some((value) => value == null)) {
    return null;
  }

  return (values as number[]).reduce((total, value) => total + value, 0);
}
