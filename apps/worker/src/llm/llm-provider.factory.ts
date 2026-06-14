import { ILlmProvider } from './llm-provider.interface';
import { LLMConfig } from './llm.types';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

class DeterministicProvider implements ILlmProvider {
  readonly providerName = 'deterministic';

  async generateStructured<T>(): Promise<never> {
    throw new Error('DeterministicProvider does not generate LLM responses');
  }
}

export function createLlmProvider(config: LLMConfig): ILlmProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config.apiKey ?? '');
    case 'anthropic':
      return new AnthropicProvider(config.apiKey ?? '');
    case 'deterministic':
    default:
      return new DeterministicProvider();
  }
}
