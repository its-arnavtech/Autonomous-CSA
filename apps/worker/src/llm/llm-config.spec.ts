import { loadLlmConfig } from './llm-config';

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

describe('loadLlmConfig', () => {
  it('returns deterministic defaults when no env vars set', () => {
    withEnv(
      { AI_PROVIDER: undefined, AI_API_KEY: undefined },
      () => {
        const config = loadLlmConfig();
        expect(config.provider).toBe('deterministic');
        expect(config.apiKey).toBeNull();
        expect(config.enableFallback).toBe(true);
        expect(config.timeoutMs).toBe(30000);
        expect(config.maxOutputTokens).toBe(700);
        expect(config.temperature).toBe(0.2);
      },
    );
  });

  it('accepts openai provider', () => {
    withEnv({ AI_PROVIDER: 'openai', AI_API_KEY: undefined }, () => {
      const config = loadLlmConfig();
      expect(config.provider).toBe('openai');
    });
  });

  it('accepts anthropic provider', () => {
    withEnv({ AI_PROVIDER: 'anthropic', AI_API_KEY: undefined }, () => {
      const config = loadLlmConfig();
      expect(config.provider).toBe('anthropic');
    });
  });

  it('throws on invalid provider', () => {
    withEnv({ AI_PROVIDER: 'grok' }, () => {
      expect(() => loadLlmConfig()).toThrow(/Invalid AI_PROVIDER/);
    });
  });

  it('does not expose API key in error messages', () => {
    withEnv({ AI_PROVIDER: 'invalid_xyz', AI_API_KEY: 'sk-secret' }, () => {
      try {
        loadLlmConfig();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('sk-secret');
      }
    });
  });

  it('disables fallback when AI_ENABLE_FALLBACK=false', () => {
    withEnv({ AI_ENABLE_FALLBACK: 'false', AI_PROVIDER: undefined }, () => {
      const config = loadLlmConfig();
      expect(config.enableFallback).toBe(false);
    });
  });

  it('throws on out-of-range AI_TIMEOUT_MS', () => {
    withEnv({ AI_TIMEOUT_MS: '0', AI_PROVIDER: undefined }, () => {
      expect(() => loadLlmConfig()).toThrow(/AI_TIMEOUT_MS/);
    });
  });

  it('throws on invalid AI_TEMPERATURE', () => {
    withEnv({ AI_TEMPERATURE: '5', AI_PROVIDER: undefined }, () => {
      expect(() => loadLlmConfig()).toThrow(/AI_TEMPERATURE/);
    });
  });

  it('reads per-task model overrides', () => {
    withEnv(
      {
        AI_PROVIDER: undefined,
        AI_MODEL_ROUTER: 'gpt-4o',
        AI_MODEL_RESOLVER: 'gpt-4o',
        AI_MODEL_CRITIC: 'gpt-4o-mini',
      },
      () => {
        const config = loadLlmConfig();
        expect(config.modelRouter).toBe('gpt-4o');
        expect(config.modelCritic).toBe('gpt-4o-mini');
      },
    );
  });
});
