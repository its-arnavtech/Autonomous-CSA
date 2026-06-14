import { Injectable } from '@nestjs/common';
import {
  AgentEventType,
  AgentStepStatus,
  AgentStepType,
  Prisma,
} from '@agentic-support/db';
import { PrismaService } from '../prisma.service';
import { CriticAgent } from './critic.agent';
import { RetrieverAgent } from './retriever.agent';
import { ResolverAgent } from './resolver.agent';
import { RouterAgent } from './router.agent';
import {
  CriticOutput,
  ResolverOutput,
  RetrieverOutput,
  RouterOutput,
} from './agent-runtime.types';

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routerAgent: RouterAgent,
    private readonly retrieverAgent: RetrieverAgent,
    private readonly resolverAgent: ResolverAgent,
    private readonly criticAgent: CriticAgent,
  ) {}

  async runPipeline(input: {
    orgId: string;
    ticketId: string;
    runId: string;
    subject: string;
    body: string;
  }) {
    const router = await this.executeStep<RouterOutput>({
      orgId: input.orgId,
      runId: input.runId,
      ticketId: input.ticketId,
      stepType: AgentStepType.ROUTER,
      startEventType: AgentEventType.ROUTER_STARTED,
      successEventType: AgentEventType.ROUTER_DECISION,
      stepInput: { subject: input.subject, body: input.body },
      execute: () =>
        this.routerAgent.route({ subject: input.subject, body: input.body }),
    });

    const retrieval = await this.executeStep<RetrieverOutput>({
      orgId: input.orgId,
      runId: input.runId,
      ticketId: input.ticketId,
      stepType: AgentStepType.RETRIEVER,
      startEventType: AgentEventType.RETRIEVER_STARTED,
      successEventType: AgentEventType.RETRIEVER_RESULTS,
      stepInput: { subject: input.subject, body: input.body, router },
      execute: () =>
        this.retrieverAgent.retrieve({
          orgId: input.orgId,
          subject: input.subject,
          body: input.body,
          router,
        }),
      outputEventType: (output) =>
        output.resultCount > 0
          ? AgentEventType.RETRIEVER_RESULTS
          : AgentEventType.KNOWLEDGE_NOT_FOUND,
      afterSuccess: async (output) => {
        await this.prisma.knowledgeRetrieval.create({
          data: {
            orgId: input.orgId,
            ticketId: input.ticketId,
            agentRunId: input.runId,
            query: output.query,
            resultCount: output.resultCount,
            resultsJson: output.results,
          },
        });
      },
    });

    const resolver = await this.executeStep<ResolverOutput>({
      orgId: input.orgId,
      runId: input.runId,
      ticketId: input.ticketId,
      stepType: AgentStepType.RESOLVER,
      startEventType: AgentEventType.RESOLVER_STARTED,
      successEventType: AgentEventType.RESOLVER_DRAFTED,
      stepInput: {
        subject: input.subject,
        body: input.body,
        router,
        retrieval,
      },
      execute: () =>
        this.resolverAgent.resolve({
          subject: input.subject,
          body: input.body,
          router,
          retrieval,
        }),
    });

    if (resolver.usedKnowledgeArticleIds.length > 0) {
      await this.appendAgentEvent({
        orgId: input.orgId,
        ticketId: input.ticketId,
        runId: input.runId,
        type: AgentEventType.KNOWLEDGE_USED,
        payload: {
          usedKnowledgeArticleIds: resolver.usedKnowledgeArticleIds,
        },
      });
    }

    const critic = await this.executeStep<CriticOutput>({
      orgId: input.orgId,
      runId: input.runId,
      ticketId: input.ticketId,
      stepType: AgentStepType.CRITIC,
      startEventType: AgentEventType.CRITIC_STARTED,
      successEventType: AgentEventType.CRITIC_REVIEWED,
      stepInput: { retrieval, resolver },
      execute: () => this.criticAgent.review({ retrieval, resolver }),
      outputStatus: (output) =>
        output.passed ? AgentStepStatus.SUCCEEDED : AgentStepStatus.BLOCKED,
      outputEventType: (output) =>
        output.passed
          ? AgentEventType.CRITIC_REVIEWED
          : AgentEventType.CRITIC_BLOCKED,
    });

    return { router, retrieval, resolver, critic };
  }

  private async executeStep<TOutput extends Prisma.InputJsonValue>(params: {
    orgId: string;
    runId: string;
    ticketId: string;
    stepType: AgentStepType;
    startEventType: AgentEventType;
    successEventType: AgentEventType;
    stepInput: Prisma.InputJsonValue;
    execute: () => Promise<TOutput> | TOutput;
    outputStatus?: (output: TOutput) => AgentStepStatus;
    outputEventType?: (output: TOutput) => AgentEventType;
    afterSuccess?: (output: TOutput, stepId: string) => Promise<void> | void;
  }) {
    const step = await this.prisma.agentStep.create({
      data: {
        orgId: params.orgId,
        agentRunId: params.runId,
        stepType: params.stepType,
        status: AgentStepStatus.STARTED,
        inputJson: params.stepInput,
      },
    });

    await this.appendAgentEvent({
      orgId: params.orgId,
      ticketId: params.ticketId,
      runId: params.runId,
      type: params.startEventType,
      payload: { stepId: step.id, stepType: params.stepType },
    });

    try {
      const output = await params.execute();
      const status = params.outputStatus?.(output) ?? AgentStepStatus.SUCCEEDED;
      const eventType =
        params.outputEventType?.(output) ?? params.successEventType;

      await this.prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status,
          outputJson: output,
          finishedAt: new Date(),
        },
      });

      await params.afterSuccess?.(output, step.id);

      await this.appendAgentEvent({
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        type: eventType,
        payload: { stepId: step.id, stepType: params.stepType, output },
      });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status: AgentStepStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
        },
      });

      await this.appendAgentEvent({
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        type: AgentEventType.AGENT_STEP_FAILED,
        payload: { stepId: step.id, stepType: params.stepType, message },
      });

      throw error;
    }
  }

  private async appendAgentEvent(params: {
    orgId: string;
    ticketId: string;
    runId: string;
    type: AgentEventType;
    payload: Prisma.InputJsonValue;
  }) {
    const max = await this.prisma.agentEvent.aggregate({
      where: { orgId: params.orgId, ticketId: params.ticketId },
      _max: { sequence: true },
    });

    await this.prisma.agentEvent.create({
      data: {
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        sequence: (max._max.sequence ?? 0) + 1,
        type: params.type,
        payload: params.payload,
      },
    });
  }
}
