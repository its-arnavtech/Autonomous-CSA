import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AgentEventType,
  AgentStepStatus,
  AgentStepType,
  LlmEventType,
  Prisma,
} from '@agentic-support/db';
import {
  getCorrelationContext,
  serializeError,
  startTimer,
} from '@agentic-support/observability';
import { MetricsService } from '../observability/metrics.service';
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
import { LlmService } from '../llm/llm.service';
import { AgentLlmMeta, LLMTask } from '../llm/llm.types';
import { sumEstimatedCostCents } from '../llm/pricing';
import {
  ROUTER_SYSTEM_PROMPT,
  buildRouterUserPrompt,
  validateRouterOutput,
  RESOLVER_SYSTEM_PROMPT,
  buildResolverUserPrompt,
  validateResolverOutput,
  CRITIC_SYSTEM_PROMPT,
  buildCriticUserPrompt,
  validateCriticOutput,
} from '../llm/prompt-templates';

const DETERMINISTIC_META: AgentLlmMeta = {
  provider: 'deterministic',
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostMicrounits: 0,
    estimatedCostCents: 0,
  },
  fallbackUsed: false,
};

function toMetricLabel(value: string) {
  return value.toLowerCase();
}

function classifyLlmOutcome(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('429') || message.includes('rate limit')) {
    return 'rate_limited';
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('abort')
  ) {
    return 'timeout';
  }

  return 'provider_error';
}

@Injectable()
export class AgentRuntimeService {
  private readonly llmService: LlmService | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly routerAgent: RouterAgent,
    private readonly retrieverAgent: RetrieverAgent,
    private readonly resolverAgent: ResolverAgent,
    private readonly criticAgent: CriticAgent,
    @Inject(LlmService) @Optional() llmService: LlmService | null = null,
    private readonly metrics: MetricsService = {
      incrementAgentStep: () => undefined,
      incrementKnowledgeRetrieval: () => undefined,
      observeKnowledgeResults: () => undefined,
      incrementKnowledgeUsed: () => undefined,
      recordLlmCall: () => undefined,
      observeLlmLatency: () => undefined,
      recordLlmUsage: () => undefined,
      incrementLlmFallback: () => undefined,
    } as unknown as MetricsService,
  ) {
    this.llmService = llmService;
  }

  async runPipeline(input: {
    orgId: string;
    ticketId: string;
    runId: string;
    subject: string;
    body: string;
  }) {
    const { output: router, llmMeta: routerMeta } =
      await this.executeStep<RouterOutput>({
        orgId: input.orgId,
        runId: input.runId,
        ticketId: input.ticketId,
        stepType: AgentStepType.ROUTER,
        startEventType: AgentEventType.ROUTER_STARTED,
        successEventType: AgentEventType.ROUTER_DECISION,
        stepInput: { subject: input.subject, body: input.body },
        execute: () =>
          this.routerAgent.route({ subject: input.subject, body: input.body }),
        llmTask: 'ROUTER',
        llmSystemPrompt: ROUTER_SYSTEM_PROMPT,
        llmUserPrompt: buildRouterUserPrompt({
          subject: input.subject,
          body: input.body,
        }),
        llmValidate: validateRouterOutput,
      });

    const { output: retrieval } = await this.executeStep<RetrieverOutput>({
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
        const outcome = output.resultCount > 0 ? 'success' : 'no_result';
        this.metrics.incrementKnowledgeRetrieval(outcome);
        this.metrics.observeKnowledgeResults(outcome, output.resultCount);

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

    const knowledgeSnippets = retrieval.results.map((r) => ({
      articleId: r.articleId,
      title: r.title,
      snippet: r.snippet,
    }));

    const { output: resolver, llmMeta: resolverMeta } =
      await this.executeStep<ResolverOutput>({
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
        llmTask: 'RESOLVER',
        llmSystemPrompt: RESOLVER_SYSTEM_PROMPT,
        llmUserPrompt: buildResolverUserPrompt({
          subject: input.subject,
          body: input.body,
          category: router.category,
          intent: router.intent,
          knowledgeSnippets,
        }),
        llmValidate: validateResolverOutput,
      });

    if (resolver.usedKnowledgeArticleIds.length > 0) {
      this.metrics.incrementKnowledgeUsed('resolver');
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

    const { output: critic, llmMeta: criticMeta } =
      await this.executeStep<CriticOutput>({
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
        llmTask: 'CRITIC',
        llmSystemPrompt: CRITIC_SYSTEM_PROMPT,
        llmUserPrompt: buildCriticUserPrompt({
          subject: input.subject,
          draftBody: resolver.draftBody,
          category: router.category,
          usedKnowledgeArticleIds: resolver.usedKnowledgeArticleIds,
          knowledgeSnippets,
        }),
        llmValidate: validateCriticOutput,
      });

    const estimatedCostCents = sumEstimatedCostCents([
      routerMeta.usage?.estimatedCostCents,
      resolverMeta.usage?.estimatedCostCents,
      criticMeta.usage?.estimatedCostCents,
    ]);

    return { router, retrieval, resolver, critic, estimatedCostCents };
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
    // Optional LLM params — omit to stay deterministic
    llmTask?: LLMTask;
    llmSystemPrompt?: string;
    llmUserPrompt?: string;
    llmValidate?: (raw: unknown) => TOutput;
  }): Promise<{ output: TOutput; llmMeta: AgentLlmMeta }> {
    const stopTimer = startTimer();
    const retryCount = Math.max(
      (getCorrelationContext()?.retryAttempt ?? 1) - 1,
      0,
    );
    const step = await this.prisma.agentStep.create({
      data: {
        orgId: params.orgId,
        agentRunId: params.runId,
        stepType: params.stepType,
        status: AgentStepStatus.STARTED,
        inputJson: params.stepInput,
        retryCount,
      },
    });
    this.metrics.incrementAgentStep(
      params.stepType,
      toMetricLabel(AgentStepStatus.STARTED),
    );

    await this.appendAgentEvent({
      orgId: params.orgId,
      ticketId: params.ticketId,
      runId: params.runId,
      type: params.startEventType,
      payload: { stepId: step.id, stepType: params.stepType },
    });

    try {
      let output: TOutput;
      let llmMeta: AgentLlmMeta = DETERMINISTIC_META;

      const canUseLlm =
        this.llmService?.isEnabled() === true &&
        params.llmTask != null &&
        params.llmSystemPrompt != null &&
        params.llmUserPrompt != null &&
        params.llmValidate != null;

      if (canUseLlm) {
        const llmProvider = this.llmService.providerName;
        const llmModel = this.llmService.getModelForTask(params.llmTask!);
        const stopLlmTimer = startTimer();

        await this.appendAgentEvent({
          orgId: params.orgId,
          ticketId: params.ticketId,
          runId: params.runId,
          type: LlmEventType.LLM_CALL_STARTED as AgentEventType,
          payload: {
            stepType: params.stepType,
            task: params.llmTask,
            model: llmModel,
          },
        });

        try {
          const llmResult = await this.llmService.generateStructured<TOutput>(
            {
              task: params.llmTask!,
              systemPrompt: params.llmSystemPrompt!,
              userPrompt: params.llmUserPrompt!,
              schemaName: params.stepType as string,
            },
            params.llmValidate!,
          );

          output = llmResult.output;
          llmMeta = {
            provider: llmResult.provider,
            model: llmResult.model,
            usage: llmResult.usage,
            fallbackUsed: false,
            finishReason: llmResult.finishReason,
          };
          this.metrics.recordLlmCall(
            llmResult.provider,
            llmResult.model,
            'success',
          );
          this.metrics.observeLlmLatency(
            llmResult.provider,
            llmResult.model,
            'success',
            stopLlmTimer(),
          );
          this.metrics.recordLlmUsage({
            provider: llmResult.provider,
            model: llmResult.model,
            inputTokens: llmResult.usage.inputTokens,
            outputTokens: llmResult.usage.outputTokens,
            estimatedCostMicrounits:
              llmResult.usage.estimatedCostMicrounits ?? null,
          });

          await this.appendAgentEvent({
            orgId: params.orgId,
            ticketId: params.ticketId,
            runId: params.runId,
            type: LlmEventType.LLM_CALL_SUCCEEDED as AgentEventType,
            payload: {
              stepType: params.stepType,
              model: llmResult.model,
              provider: llmResult.provider,
            },
          });

          await this.appendAgentEvent({
            orgId: params.orgId,
            ticketId: params.ticketId,
            runId: params.runId,
            type: LlmEventType.LLM_USAGE_RECORDED as AgentEventType,
            payload: {
              provider: llmResult.provider,
              model: llmResult.model,
              inputTokens: llmResult.usage.inputTokens,
              outputTokens: llmResult.usage.outputTokens,
              estimatedCostCents: llmResult.usage.estimatedCostCents,
            },
          });
        } catch (llmErr) {
          const llmMsg =
            llmErr instanceof Error ? llmErr.message : String(llmErr);
          const llmOutcome = classifyLlmOutcome(llmErr);

          await this.appendAgentEvent({
            orgId: params.orgId,
            ticketId: params.ticketId,
            runId: params.runId,
            type: LlmEventType.LLM_CALL_FAILED as AgentEventType,
            payload: {
              stepType: params.stepType,
              message: llmMsg.slice(0, 500),
            },
          });
          this.metrics.recordLlmCall(llmProvider, llmModel, llmOutcome);
          this.metrics.observeLlmLatency(
            llmProvider,
            llmModel,
            llmOutcome,
            stopLlmTimer(),
          );

          if (!this.llmService.isFallbackEnabled()) {
            throw llmErr;
          }

          await this.appendAgentEvent({
            orgId: params.orgId,
            ticketId: params.ticketId,
            runId: params.runId,
            type: LlmEventType.LLM_FALLBACK_USED as AgentEventType,
            payload: {
              stepType: params.stepType,
              reason: llmMsg.slice(0, 200),
            },
          });
          this.metrics.incrementLlmFallback(llmProvider, llmModel);

          output = await params.execute();
          llmMeta = {
            provider: llmProvider,
            model: llmModel,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedCostMicrounits: 0,
              estimatedCostCents: 0,
            },
            fallbackUsed: true,
          };
        }
      } else {
        output = await params.execute();
      }

      const status = params.outputStatus?.(output) ?? AgentStepStatus.SUCCEEDED;
      const eventType =
        params.outputEventType?.(output) ?? params.successEventType;

      // Keep LLM metadata mirrored in outputJson for audit inspection.
      const outputJson =
        llmMeta.provider !== 'deterministic' || llmMeta.fallbackUsed
          ? ({
              ...(typeof output === 'object' && output !== null
                ? (output as Record<string, unknown>)
                : { value: output }),
              _llm: {
                provider: llmMeta.provider,
                model: llmMeta.model,
                usage: llmMeta.usage,
                fallbackUsed: llmMeta.fallbackUsed,
                finishReason: llmMeta.finishReason,
              },
            } as Prisma.InputJsonValue)
          : output;

      await this.prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status,
          outputJson,
          provider:
            llmMeta.provider !== 'deterministic' || llmMeta.fallbackUsed
              ? llmMeta.provider
              : null,
          model: llmMeta.model ?? null,
          inputTokens: llmMeta.usage?.inputTokens ?? null,
          outputTokens: llmMeta.usage?.outputTokens ?? null,
          estimatedCostCents: llmMeta.usage?.estimatedCostCents ?? null,
          finishedAt: new Date(),
          durationMs: stopTimer(),
        },
      });
      this.metrics.incrementAgentStep(params.stepType, toMetricLabel(status));

      await params.afterSuccess?.(output, step.id);

      await this.appendAgentEvent({
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        type: eventType,
        payload: { stepId: step.id, stepType: params.stepType, output },
      });

      return { output, llmMeta };
    } catch (error) {
      const serialized = serializeError(error);

      await this.prisma.agentStep.update({
        where: { id: step.id },
        data: {
          status: AgentStepStatus.FAILED,
          errorMessage: serialized.message,
          errorCode: serialized.errorCode,
          finishedAt: new Date(),
          durationMs: stopTimer(),
        },
      });
      this.metrics.incrementAgentStep(
        params.stepType,
        toMetricLabel(AgentStepStatus.FAILED),
      );

      await this.appendAgentEvent({
        orgId: params.orgId,
        ticketId: params.ticketId,
        runId: params.runId,
        type: AgentEventType.AGENT_STEP_FAILED,
        payload: {
          stepId: step.id,
          stepType: params.stepType,
          message: serialized.message,
          errorCode: serialized.errorCode,
        },
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
        correlationId: getCorrelationContext()?.correlationId ?? null,
        sequence: (max._max.sequence ?? 0) + 1,
        type: params.type,
        payload: params.payload,
      },
    });
  }
}
