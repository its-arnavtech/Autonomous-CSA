import { LLMRequest, LLMStructuredResponse } from './llm.types';

export interface ILlmProvider {
  readonly providerName: string;
  generateStructured<T>(
    request: LLMRequest,
    validate: (raw: unknown) => T,
  ): Promise<LLMStructuredResponse<T>>;
}
