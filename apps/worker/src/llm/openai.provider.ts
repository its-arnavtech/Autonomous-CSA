import { ILlmProvider } from './llm-provider.interface';
import { LLMRequest, LLMStructuredResponse } from './llm.types';
import { safeParseJson, truncateForLog } from './safe-json';

type OpenAIChoice = {
  message: { content: string | null };
  finish_reason: string;
};

type OpenAIResponse = {
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
};

// gpt-4o-mini pricing as of mid-2025: $0.15/1M input, $0.60/1M output
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil((inputTokens * 0.00015 + outputTokens * 0.0006) / 10);
}

export class OpenAIProvider implements ILlmProvider {
  readonly providerName = 'openai';
  // Non-enumerable so the key is never accidentally serialized via JSON.stringify
  private readonly apiKey: string;

  constructor(apiKey: string) {
    Object.defineProperty(this, 'apiKey', {
      value: apiKey,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  async generateStructured<T>(
    request: LLMRequest,
    validate: (raw: unknown) => T,
  ): Promise<LLMStructuredResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    let rawRes: Response;
    try {
      rawRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!rawRes.ok) {
      const body = await rawRes.text();
      throw new Error(
        `OpenAI API error ${rawRes.status}: ${body.slice(0, 300)}`,
      );
    }

    const json = (await rawRes.json()) as OpenAIResponse;
    const rawText = json.choices[0]?.message?.content ?? '';
    const finishReason = json.choices[0]?.finish_reason;
    const resolvedModel = json.model ?? request.model;

    const output = safeParseJson<T>(rawText, validate, request.schemaName);

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const totalTokens = json.usage?.total_tokens ?? inputTokens + outputTokens;

    return {
      output,
      rawText: truncateForLog(rawText),
      provider: this.providerName,
      model: resolvedModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostCents: estimateCostCents(inputTokens, outputTokens),
      },
      finishReason,
    };
  }
}
