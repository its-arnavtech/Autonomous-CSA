import { workerLogger } from '../observability/worker-logger';
import { LLMConfig } from './llm.types';

function parseIntEnv(
  name: string,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val < min || val > max) {
    throw new Error(
      `Invalid ${name}: expected integer ${min}-${max}, got "${raw}"`,
    );
  }
  return val;
}

function parseFloatEnv(
  name: string,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const val = parseFloat(raw);
  if (isNaN(val) || val < min || val > max) {
    throw new Error(
      `Invalid ${name}: expected number ${min}-${max}, got "${raw}"`,
    );
  }
  return val;
}

const VALID_PROVIDERS = ['deterministic', 'openai', 'anthropic'] as const;

export function loadLlmConfig(): LLMConfig {
  const providerRaw = process.env.AI_PROVIDER ?? 'deterministic';

  if (
    !VALID_PROVIDERS.includes(providerRaw as (typeof VALID_PROVIDERS)[number])
  ) {
    throw new Error(
      `Invalid AI_PROVIDER "${providerRaw}". Valid values: ${VALID_PROVIDERS.join(', ')}`,
    );
  }

  const provider = providerRaw as LLMConfig['provider'];
  const apiKey = process.env.AI_API_KEY ?? null;

  if (provider !== 'deterministic' && !apiKey) {
    workerLogger.warn('LLM provider configured without API key', {
      provider,
      fallbackEnabled: process.env.AI_ENABLE_FALLBACK !== 'false',
    });
  }

  return {
    provider,
    apiKey,
    modelRouter: process.env.AI_MODEL_ROUTER ?? 'gpt-4o-mini',
    modelResolver: process.env.AI_MODEL_RESOLVER ?? 'gpt-4o-mini',
    modelCritic: process.env.AI_MODEL_CRITIC ?? 'gpt-4o-mini',
    timeoutMs: parseIntEnv('AI_TIMEOUT_MS', 30000, 1000, 120000),
    maxOutputTokens: parseIntEnv('AI_MAX_OUTPUT_TOKENS', 700, 50, 4096),
    temperature: parseFloatEnv('AI_TEMPERATURE', 0.2, 0.0, 2.0),
    enableFallback: process.env.AI_ENABLE_FALLBACK !== 'false',
  };
}
