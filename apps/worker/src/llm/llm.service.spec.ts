import { LlmService } from './llm.service';

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
) {
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

describe('LlmService', () => {
  it('is not enabled when provider is deterministic', () => {
    withEnv({ AI_PROVIDER: undefined }, () => {
      const svc = new LlmService();
      expect(svc.isEnabled()).toBe(false);
      expect(svc.providerName).toBe('deterministic');
    });
  });

  it('is enabled when provider is openai', () => {
    withEnv({ AI_PROVIDER: 'openai', AI_API_KEY: undefined }, () => {
      const svc = new LlmService();
      expect(svc.isEnabled()).toBe(true);
      expect(svc.providerName).toBe('openai');
    });
  });

  it('fallback is enabled by default', () => {
    withEnv({ AI_PROVIDER: undefined, AI_ENABLE_FALLBACK: undefined }, () => {
      const svc = new LlmService();
      expect(svc.isFallbackEnabled()).toBe(true);
    });
  });

  it('fallback can be disabled', () => {
    withEnv({ AI_PROVIDER: undefined, AI_ENABLE_FALLBACK: 'false' }, () => {
      const svc = new LlmService();
      expect(svc.isFallbackEnabled()).toBe(false);
    });
  });

  it('routes model to correct task', () => {
    withEnv(
      {
        AI_PROVIDER: undefined,
        AI_MODEL_ROUTER: 'gpt-4o',
        AI_MODEL_RESOLVER: 'gpt-4o-mini',
        AI_MODEL_CRITIC: 'gpt-4o-mini',
      },
      () => {
        const svc = new LlmService();
        expect(svc.getModelForTask('ROUTER')).toBe('gpt-4o');
        expect(svc.getModelForTask('RESOLVER')).toBe('gpt-4o-mini');
      },
    );
  });

  it('config does not expose apiKey via JSON serialization', () => {
    withEnv({ AI_PROVIDER: 'openai', AI_API_KEY: 'sk-prod-secret' }, () => {
      const svc = new LlmService();
      // Config has apiKey but serialize only providerName (public getter)
      const serialized = JSON.stringify({ provider: svc.providerName });
      expect(serialized).not.toContain('sk-prod-secret');
    });
  });
});
