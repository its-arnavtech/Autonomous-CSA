import {
  AgentEventType,
  AgentStepStatus,
  AgentStepType,
} from '@agentic-support/db';
import { AgentRuntimeService } from './agent-runtime.service';

type AgentStepCreateCall = {
  data: {
    orgId?: string;
    agentRunId?: string;
    stepType: AgentStepType;
    status?: AgentStepStatus;
  };
};

type AgentStepUpdateCall = {
  where: { id: string };
  data: {
    status: AgentStepStatus;
    finishedAt?: Date;
  };
};

describe('AgentRuntimeService', () => {
  function createService() {
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
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _max: { sequence: 0 } })
          .mockResolvedValueOnce({ _max: { sequence: 1 } })
          .mockResolvedValueOnce({ _max: { sequence: 2 } })
          .mockResolvedValueOnce({ _max: { sequence: 3 } })
          .mockResolvedValueOnce({ _max: { sequence: 4 } })
          .mockResolvedValueOnce({ _max: { sequence: 5 } })
          .mockResolvedValueOnce({ _max: { sequence: 6 } })
          .mockResolvedValueOnce({ _max: { sequence: 7 } })
          .mockResolvedValueOnce({ _max: { sequence: 8 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const routerAgent = {
      route: jest.fn().mockReturnValue({
        category: 'billing',
        intent: 'assist_billing_issue',
        urgency: 'normal',
        confidence: 0.91,
        notes: 'billing',
      }),
    };
    const retrieverAgent = {
      retrieve: jest.fn().mockResolvedValue({
        query: 'billing invoice wrong assist billing issue',
        resultCount: 1,
        results: [
          {
            articleId: 'article_1',
            title: 'Duplicate invoice charge policy',
            snippet: 'Confirm the invoice ID and review payment records.',
            score: 26,
            tags: ['billing', 'invoice'],
          },
        ],
      }),
    };
    const resolverAgent = {
      resolve: jest.fn().mockReturnValue({
        draftBody:
          'Thanks for reaching out about your billing request. Based on our duplicate invoice charge policy, the recommended next step is to confirm the relevant details you shared so we can review the records accurately. We will verify the information against our internal guidance and follow up with the next support action shortly.',
        resolutionSummary: 'Prepared a billing reply.',
        confidence: 0.93,
        usedKnowledgeArticleIds: ['article_1'],
      }),
    };
    const criticAgent = {
      review: jest.fn().mockReturnValue({
        passed: true,
        safetyVerdict: 'safe',
        completenessScore: 0.89,
        issues: [],
        recommendedAction: 'approve',
      }),
    };

    return {
      prisma,
      routerAgent,
      retrieverAgent,
      resolverAgent,
      criticAgent,
      service: new AgentRuntimeService(
        prisma as never,
        routerAgent as never,
        retrieverAgent as never,
        resolverAgent as never,
        criticAgent as never,
      ),
    };
  }

  it('creates and completes router, retriever, resolver, and critic steps', async () => {
    const { prisma, service } = createService();

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'Billing issue',
      body: 'My last invoice looks wrong.',
    });

    const createCalls = prisma.agentStep.create.mock
      .calls as AgentStepCreateCall[][];
    expect(createCalls[0]?.[0].data).toMatchObject({
      orgId: 'org_1',
      agentRunId: 'run_1',
      stepType: AgentStepType.ROUTER,
      status: AgentStepStatus.STARTED,
    });
    expect(createCalls[1]?.[0].data.stepType).toBe(AgentStepType.RETRIEVER);
    expect(createCalls[2]?.[0].data.stepType).toBe(AgentStepType.RESOLVER);
    expect(createCalls[3]?.[0].data.stepType).toBe(AgentStepType.CRITIC);
    expect(prisma.agentStep.update).toHaveBeenCalledTimes(4);
    expect(prisma.knowledgeRetrieval.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentEvent.create).toHaveBeenCalledTimes(9);

    const eventTypes = prisma.agentEvent.create.mock.calls.map(
      ([args]: [{ data: { type: AgentEventType } }]) => args.data.type,
    );
    expect(eventTypes).toEqual([
      AgentEventType.ROUTER_STARTED,
      AgentEventType.ROUTER_DECISION,
      AgentEventType.RETRIEVER_STARTED,
      AgentEventType.RETRIEVER_RESULTS,
      AgentEventType.RESOLVER_STARTED,
      AgentEventType.RESOLVER_DRAFTED,
      AgentEventType.KNOWLEDGE_USED,
      AgentEventType.CRITIC_STARTED,
      AgentEventType.CRITIC_REVIEWED,
    ]);

    expect(result.router.category).toBe('billing');
    expect(result.retrieval.resultCount).toBe(1);
    expect(result.resolver.usedKnowledgeArticleIds).toEqual(['article_1']);
    expect(result.critic.passed).toBe(true);
  });

  it('marks the critic step blocked when retrieved context is ignored', async () => {
    const { prisma, criticAgent, resolverAgent, service } = createService();
    resolverAgent.resolve.mockReturnValue({
      draftBody:
        'Thanks for reaching out. We are reviewing the billing details you shared and will follow up shortly.',
      resolutionSummary: 'Prepared a generic billing reply.',
      confidence: 0.9,
      usedKnowledgeArticleIds: [],
    });
    criticAgent.review.mockReturnValue({
      passed: false,
      safetyVerdict: 'needs_review',
      completenessScore: 0.25,
      issues: ['Retrieved context was available but not used'],
      recommendedAction: 'block',
    });

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_1',
      runId: 'run_1',
      subject: 'API bug',
      body: 'The endpoint is failing.',
    });

    const updateCalls = prisma.agentStep.update.mock
      .calls as AgentStepUpdateCall[][];
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];
    expect(lastUpdate?.where.id).toBe('step_critic');
    expect(lastUpdate?.data.status).toBe(AgentStepStatus.BLOCKED);
    expect(lastUpdate?.data.finishedAt).toBeInstanceOf(Date);

    const eventTypes = prisma.agentEvent.create.mock.calls.map(
      ([args]: [{ data: { type: AgentEventType } }]) => args.data.type,
    );
    expect(eventTypes[eventTypes.length - 1]).toBe(
      AgentEventType.CRITIC_BLOCKED,
    );
    expect(result.critic.passed).toBe(false);
  });

  it('records KNOWLEDGE_NOT_FOUND and still creates a fallback draft when no articles match', async () => {
    const { prisma, resolverAgent, retrieverAgent, service } = createService();
    retrieverAgent.retrieve.mockResolvedValue({
      query: 'portal api error technical',
      resultCount: 0,
      results: [],
    });
    resolverAgent.resolve.mockReturnValue({
      draftBody:
        'Thanks for flagging this technical issue. We are reviewing the behavior you described and will follow up with troubleshooting guidance shortly.',
      resolutionSummary: 'Prepared a technical fallback reply.',
      confidence: 0.88,
      usedKnowledgeArticleIds: [],
    });

    const result = await service.runPipeline({
      orgId: 'org_1',
      ticketId: 'ticket_2',
      runId: 'run_2',
      subject: 'Portal API error',
      body: 'The integration is not working.',
    });

    const eventTypes = prisma.agentEvent.create.mock.calls.map(
      ([args]: [{ data: { type: AgentEventType } }]) => args.data.type,
    );
    expect(eventTypes).toContain(AgentEventType.KNOWLEDGE_NOT_FOUND);
    expect(prisma.knowledgeRetrieval.create).toHaveBeenCalled();
    expect(result.retrieval.resultCount).toBe(0);
    expect(result.resolver.usedKnowledgeArticleIds).toEqual([]);
  });
});
