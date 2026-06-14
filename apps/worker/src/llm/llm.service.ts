import { Injectable } from '@nestjs/common';
import { ILlmProvider } from './llm-provider.interface';
import { createLlmProvider } from './llm-provider.factory';
import { loadLlmConfig } from './llm-config';
import {
  LLMConfig,
  LLMRequest,
  LLMStructuredResponse,
  LLMTask,
} from './llm.types';

@Injectable()
export class LlmService {
  readonly config: LLMConfig;
  private readonly provider: ILlmProvider;

  constructor() {
    this.config = loadLlmConfig();
    this.provider = createLlmProvider(this.config);
  }

  isEnabled(): boolean {
    return this.config.provider !== 'deterministic';
  }

  isFallbackEnabled(): boolean {
    return this.config.enableFallback;
  }

  get providerName(): string {
    return this.config.provider;
  }

  getModelForTask(task: LLMTask): string {
    switch (task) {
      case 'ROUTER':
        return this.config.modelRouter;
      case 'RESOLVER':
        return this.config.modelResolver;
      case 'CRITIC':
        return this.config.modelCritic;
    }
  }

  generateStructured<T>(
    request: Omit<
      LLMRequest,
      'model' | 'timeoutMs' | 'maxOutputTokens' | 'temperature'
    >,
    validate: (raw: unknown) => T,
  ): Promise<LLMStructuredResponse<T>> {
    const fullRequest: LLMRequest = {
      ...request,
      model: this.getModelForTask(request.task),
      timeoutMs: this.config.timeoutMs,
      maxOutputTokens: this.config.maxOutputTokens,
      temperature: this.config.temperature,
    };
    return this.provider.generateStructured<T>(fullRequest, validate);
  }
}
