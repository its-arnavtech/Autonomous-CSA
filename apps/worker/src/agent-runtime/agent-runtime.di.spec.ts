import { Test } from '@nestjs/testing';
import { AgentRuntimeService } from './agent-runtime.service';
import { PrismaService } from '../prisma.service';
import { RouterAgent } from './router.agent';
import { RetrieverAgent } from './retriever.agent';
import { ResolverAgent } from './resolver.agent';
import { CriticAgent } from './critic.agent';
import { LlmService } from '../llm/llm.service';
import { MetricsService } from '../observability/metrics.service';

const ORIGINAL_ENV = { ...process.env };

describe('AgentRuntimeService dependency injection', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('injects LlmService when a non-deterministic provider is configured', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'sk-phase9-test-key';
    process.env.AI_ENABLE_FALLBACK = 'false';

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentRuntimeService,
        LlmService,
        { provide: PrismaService, useValue: {} },
        { provide: RouterAgent, useValue: {} },
        { provide: RetrieverAgent, useValue: {} },
        { provide: ResolverAgent, useValue: {} },
        { provide: CriticAgent, useValue: {} },
        {
          provide: MetricsService,
          useValue: {
            incrementAgentStep: jest.fn(),
            incrementKnowledgeRetrieval: jest.fn(),
            observeKnowledgeResults: jest.fn(),
            incrementKnowledgeUsed: jest.fn(),
            recordLlmCall: jest.fn(),
            observeLlmLatency: jest.fn(),
            recordLlmUsage: jest.fn(),
            incrementLlmFallback: jest.fn(),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(AgentRuntimeService);
    const internal = service as unknown as { llmService: LlmService | null };

    expect(internal.llmService).toBeInstanceOf(LlmService);
    expect(internal.llmService?.isEnabled()).toBe(true);
    expect(internal.llmService?.providerName).toBe('openai');
  });
});
