export type LLMTask = 'ROUTER' | 'RESOLVER' | 'CRITIC';

export type LLMConfig = {
  provider: 'deterministic' | 'openai' | 'anthropic';
  apiKey: string | null;
  modelRouter: string;
  modelResolver: string;
  modelCritic: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  enableFallback: boolean;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
};

export type LLMRequest = {
  task: LLMTask;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
};

export type LLMStructuredResponse<T> = {
  output: T;
  rawText: string;
  provider: string;
  model: string;
  usage: LLMUsage;
  finishReason?: string;
};

export type AgentLlmMeta = {
  provider: string;
  model?: string;
  usage?: LLMUsage;
  fallbackUsed: boolean;
  finishReason?: string;
};
