import { AgentEventType, AgentStepStatus, AgentStepType, LlmEventType } from '@agentic-support/db';
import { AgentRuntimeService } from './agent-runtime.service';

// Mock LlmService that succeeds or fails based on config
function mockLlmService(
  opts: {
    enabled?: boolean;
    fallbackEnabled?: boolean;
    fail?: boolean;
  } = {},
) {
  const {
    enabled = true,
    fallbackEnabled = true,
    fail = false,
  } = opts;

  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    isFallbackEnabled: jest.fn().mockReturnValue(fallbackEnabled),
    providerName: 'openai',
    getModelForTask: jest.fn().mockReturnValue('gpt-4o-mini'),
    generateStructured: fail
      ? jest.fn().mockRejectedValue(new Error('API timeout'))
      : jest.fn().mockImplementation(async (request: unknown, validate: (raw: unknown) => unknown) => {
          const { task } = request as { task: string };
          let rawOutput: unknown;
          if (task === 'ROUTER') {
            rawOutput = {
              category: 'billing',
              intent: 'assist_billing_llm',
              urgency: 'normal',
              confidence: 0.95,
              notes: 'LLM routing decision.',
            };
          } else if (task === 'RESOLVER') {
            rawOutput = {
              draftBody: 'Thank you for contacting us about your billing issue. We will review your account and follow up shortly.',
              resolutionSummary: 'LLM billing response.',
              confidence: 0.92,
              usedKnowledgeArticleIds: [],
            };
          } else {
            rawOutput = {
              passed: true,
              safetyVerdict: 'safe',
              completenessScore: 0.9,
              issues: [],
              recommendedAction: 'approve',
            };
          }
          return {
            output: validate(rawOutput),
            rawText: JSON.stringify(rawOutput),
            provider: 'openai',
            model: 'gpt-4o-mini',
            usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180, estimatedCostCents: 2 },
          };
        }),
  };
}

function createService(llmSvc: ReturnType<typeof mockLlmService> | null = null) {
  const prisma = {
    agentStep: {
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'step_router' })
        .mockResolvedValueOnce({ id: 'step_retriever' })
        .mockResolvedValueOnce({ id: 'step_resolver' })
        .mockResolvedValueOnce({ id: 'step_critic' }),
      update: jest.fn().mockResolvedValue({}),
    },
    knowledgeRetrieval: {
      create: jest.fn().mockResolvedValue({ id: 'retrieval_1' }),
    },
    agentEvent: {
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const routerAgent = {
    route: jest.fn().mockReturnValue({
      category: 'billing',
      intent: 'assist_billing_deterministic',
      urgency: 'normal',
      confidence: 0.88,
      notes: 'Deterministic routing.',
    }),
  };
  const retrieverAgent = {
    retrieve: jest.fn().mockResolvedValue({
      query: 'billing',
      resultCount: 0,
      results: [],
    }),
  };
  const resolverAgent = {
    resolve: jest.fn().mockReturnValue({
      draftBody: 'Deterministic draft response.',
      resolutionSummary: 'Deterministic fallback.',
      confidence: 0.8,
      usedKnowledgeArticleIds: [],
    }),
  };
  const criticAgent = {
    review: jest.fn().mockReturnValue({
      passed: true,
      safetyVerdict: 'safe',
      completenessScore: 0.85,
      issues: [],
      recommendedAction: 'approve',
    }),
  };

  return {
    prisma,
    routerAgent,
    resolverAgent,
    service: new AgentRuntimeService(
      prisma as never,
      routerAgent as never,
      retrieverAgent as never,
      resolverAgent as never,
      criticAgent as never,
      llmSvc as never,
    ),
  };
}

describe('AgentRuntimeService — LLM integration', () => {
  it('uses LLM output when provider is enabled and call succeeds', async () => {
    const llm = mockLlmService({ enabled: true, fail: false });
    const { service, prisma } = createService(llm);

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'Billing issue',
      body: 'Invoice looks wrong.',
    });

    expect(llm.generateStructured).toHaveBeenCalledTimes(3); // Router, Resolver, Critic
    expect(result.router.intent).toBe('assist_billing_llm');
    expect(result.estimatedCostCents).toBe(6); // 3 steps × 2¢

    // LLM metadata is stored in outputJson._llm (separate columns pending prisma generate)
    const updateCalls = prisma.agentStep.update.mock.calls as Array<[{ data: { outputJson?: Record<string, unknown> } }]>;
    const routerOutputJson = updateCalls[0]?.[0].data.outputJson ?? {};
    expect((routerOutputJson._llm as Record<string, unknown>)?.provider).toBe('openai');

    const eventTypes = (prisma.agentEvent.create.mock.calls as Array<[{ data: { type: AgentEventType } }]>).map(
      ([args]) => args.data.type,
    );
    expect(eventTypes).toContain(LlmEventType.LLM_CALL_STARTED);
    expect(eventTypes).toContain(LlmEventType.LLM_CALL_SUCCEEDED);
    expect(eventTypes).toContain(LlmEventType.LLM_USAGE_RECORDED);
    expect(eventTypes).not.toContain(LlmEventType.LLM_CALL_FAILED);
    expect(eventTypes).not.toContain(LlmEventType.LLM_FALLBACK_USED);
  });

  it('falls back to deterministic when LLM fails and fallback is enabled', async () => {
    const llm = mockLlmService({ enabled: true, fail: true, fallbackEnabled: true });
    const { service, prisma, resolverAgent, routerAgent } = createService(llm);

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'Billing issue',
      body: 'Invoice looks wrong.',
    });

    // Deterministic agents should have been called as fallback
    expect(routerAgent.route).toHaveBeenCalled();
    expect(result.router.intent).toBe('assist_billing_deterministic');
    expect(result.estimatedCostCents).toBe(0); // fallback has no LLM cost

    const eventTypes = (prisma.agentEvent.create.mock.calls as Array<[{ data: { type: AgentEventType } }]>).map(
      ([args]) => args.data.type,
    );
    expect(eventTypes).toContain(LlmEventType.LLM_CALL_FAILED);
    expect(eventTypes).toContain(LlmEventType.LLM_FALLBACK_USED);
    expect(eventTypes).not.toContain(LlmEventType.LLM_CALL_SUCCEEDED);

    // In fallback mode, outputJson._llm.provider = llmProviderName, fallbackUsed = true
    const updateCalls = prisma.agentStep.update.mock.calls as Array<[{ data: { outputJson?: Record<string, unknown> } }]>;
    const routerOutputJson = updateCalls[0]?.[0].data.outputJson ?? {};
    const llmMeta = routerOutputJson._llm as Record<string, unknown>;
    expect(llmMeta?.provider).toBe('openai');
    expect(llmMeta?.fallbackUsed).toBe(true);
  });

  it('throws when LLM fails and fallback is disabled', async () => {
    const llm = mockLlmService({ enabled: true, fail: true, fallbackEnabled: false });
    const { service } = createService(llm);

    await expect(
      service.runPipeline({
        orgId: 'org_1',
        ticketId: 'ticket_1',
        runId: 'run_1',
        subject: 'Billing issue',
        body: 'Invoice looks wrong.',
      }),
    ).rejects.toThrow('API timeout');
  });

  it('skips LLM and uses deterministic when provider is not enabled', async () => {
    const llm = mockLlmService({ enabled: false });
    const { service, routerAgent, prisma } = createService(llm);

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'Billing',
      body: 'Invoice.',
    });

    expect(llm.generateStructured).not.toHaveBeenCalled();
    expect(routerAgent.route).toHaveBeenCalled();
    expect(result.router.intent).toBe('assist_billing_deterministic');

    const eventTypes = (prisma.agentEvent.create.mock.calls as Array<[{ data: { type: AgentEventType } }]>).map(
      ([args]) => args.data.type,
    );
    expect(eventTypes).not.toContain(LlmEventType.LLM_CALL_STARTED);
  });

  it('API key is not serialized in agentStep outputJson or events', async () => {
    const llm = mockLlmService({ enabled: true, fail: false });
    const { service, prisma } = createService(llm);

    await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'Billing',
      body: 'Invoice.',
    });

    const allPayloads = JSON.stringify(prisma.agentEvent.create.mock.calls);
    const allUpdates = JSON.stringify(prisma.agentStep.update.mock.calls);

    // These should never appear in any event or step payload
    expect(allPayloads).not.toMatch(/sk-/);
    expect(allUpdates).not.toMatch(/sk-/);
    expect(allPayloads).not.toMatch(/apiKey/);
    expect(allUpdates).not.toMatch(/apiKey/);
  });

  describe('step status and types', () => {
    it('creates four steps with correct stepTypes', async () => {
      const { service, prisma } = createService(null);

      await service.runPipeline({
        orgId: 'org_1',
        ticketId: 'ticket_1',
        runId: 'run_1',
        subject: 'Test',
        body: 'Body.',
      });

      const createCalls = prisma.agentStep.create.mock.calls as Array<[{ data: { stepType: AgentStepType } }]>;
      expect(createCalls[0]?.[0].data.stepType).toBe(AgentStepType.ROUTER);
      expect(createCalls[1]?.[0].data.stepType).toBe(AgentStepType.RETRIEVER);
      expect(createCalls[2]?.[0].data.stepType).toBe(AgentStepType.RESOLVER);
      expect(createCalls[3]?.[0].data.stepType).toBe(AgentStepType.CRITIC);

      const updateCalls = prisma.agentStep.update.mock.calls as Array<[{ data: { status: AgentStepStatus } }]>;
      expect(updateCalls).toHaveLength(4);
      expect(updateCalls.every(([args]) => args.data.status === AgentStepStatus.SUCCEEDED)).toBe(true);
    });
  });
});
