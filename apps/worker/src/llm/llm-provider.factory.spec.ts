import { createLlmProvider } from './llm-provider.factory';
import { LLMConfig } from './llm.types';

function baseConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    provider: 'deterministic',
    apiKey: null,
    modelRouter: 'gpt-4o-mini',
    modelResolver: 'gpt-4o-mini',
    modelCritic: 'gpt-4o-mini',
    timeoutMs: 30000,
    maxOutputTokens: 700,
    temperature: 0.2,
    enableFallback: true,
    ...overrides,
  };
}

describe('createLlmProvider', () => {
  it('returns a provider named "deterministic" for deterministic config', () => {
    const provider = createLlmProvider(baseConfig());
    expect(provider.providerName).toBe('deterministic');
  });

  it('returns a provider named "openai" for openai config', () => {
    const provider = createLlmProvider(
      baseConfig({ provider: 'openai', apiKey: 'sk-test' }),
    );
    expect(provider.providerName).toBe('openai');
  });

  it('returns a provider named "anthropic" for anthropic config', () => {
    const provider = createLlmProvider(
      baseConfig({ provider: 'anthropic', apiKey: 'sk-ant-test' }),
    );
    expect(provider.providerName).toBe('anthropic');
  });

  it('deterministic provider throws when generateStructured is called', async () => {
    const provider = createLlmProvider(baseConfig());
    await expect(
      provider.generateStructured(
        {
          task: 'ROUTER',
          model: 'none',
          systemPrompt: '',
          userPrompt: '',
          schemaName: 'Test',
          timeoutMs: 1000,
          maxOutputTokens: 100,
          temperature: 0.2,
        },
        (x) => x,
      ),
    ).rejects.toThrow(/does not generate/);
  });

  it('openai provider does not expose apiKey via providerName', () => {
    const provider = createLlmProvider(
      baseConfig({ provider: 'openai', apiKey: 'sk-secret-key' }),
    );
    expect(JSON.stringify(provider)).not.toContain('sk-secret-key');
    expect(provider.providerName).not.toContain('sk-secret-key');
  });
});
