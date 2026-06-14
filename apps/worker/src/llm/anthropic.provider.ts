import { ILlmProvider } from './llm-provider.interface';
import { LLMRequest, LLMStructuredResponse } from './llm.types';
import { safeParseJson, truncateForLog } from './safe-json';

type AnthropicContent = { type: 'text'; text: string };

type AnthropicResponse = {
  content: AnthropicContent[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  stop_reason: string;
};

// claude-haiku-4-5 pricing: ~$0.25/1M input, $1.25/1M output (approx mid-2025)
function estimateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil((inputTokens * 0.00025 + outputTokens * 0.00125) / 10);
}

export class AnthropicProvider implements ILlmProvider {
  readonly providerName = 'anthropic';
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
      rawRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system:
            request.systemPrompt +
            '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code blocks.',
          messages: [{ role: 'user', content: request.userPrompt }],
          temperature: request.temperature,
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!rawRes.ok) {
      const body = await rawRes.text();
      throw new Error(
        `Anthropic API error ${rawRes.status}: ${body.slice(0, 300)}`,
      );
    }

    const json = (await rawRes.json()) as AnthropicResponse;
    const rawText = json.content.find((c) => c.type === 'text')?.text ?? '';
    const resolvedModel = json.model ?? request.model;

    const output = safeParseJson<T>(rawText, validate, request.schemaName);

    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

    return {
      output,
      rawText: truncateForLog(rawText),
      provider: this.providerName,
      model: resolvedModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostCents: estimateCostCents(inputTokens, outputTokens),
      },
      finishReason: json.stop_reason,
    };
  }
}
