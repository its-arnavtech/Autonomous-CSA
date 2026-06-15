import { Injectable } from '@nestjs/common';
import {
  METRIC_NAMES,
  normalizeMetricOutcome,
  toStatusClass,
} from '@agentic-support/observability';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

type MetricsState = {
  registry: Registry;
  httpRequestsTotal: Counter<'method' | 'route' | 'statusClass'>;
  httpRequestDurationMs: Histogram<'method' | 'route' | 'statusClass'>;
  httpActiveRequests: Gauge<'route' | 'method'>;
  authFailuresTotal: Counter<'flow' | 'reason'>;
  authorizationDenialsTotal: Counter;
  authLoginsTotal: Counter<'outcome'>;
  authRefreshTotal: Counter<'outcome'>;
  authRegistrationsTotal: Counter<'outcome'>;
  queueJobsEnqueuedTotal: Counter<'jobName' | 'trigger'>;
  queueJobsStartedTotal: Counter<'jobName'>;
  queueJobsCompletedTotal: Counter<'jobName'>;
  queueJobsFailedTotal: Counter<'jobName' | 'outcome'>;
  queueJobsRetriedTotal: Counter<'jobName' | 'outcome'>;
  queueJobDurationMs: Histogram<'jobName' | 'outcome'>;
  queueDeadLetteredTotal: Counter<'jobName' | 'outcome'>;
  agentRunsTotal: Counter<'status' | 'trigger'>;
  agentRunDurationMs: Histogram<'status'>;
  agentStepsTotal: Counter<'stepType' | 'status'>;
  guardrailOutcomesTotal: Counter<'guardrailType' | 'decision'>;
  approvalsRequiredTotal: Counter<'source'>;
  draftsCreatedTotal: Counter<'source'>;
  draftsSentTotal: Counter<'source'>;
  llmCallsTotal: Counter<'provider' | 'model' | 'outcome'>;
  llmInputTokensTotal: Counter<'provider' | 'model'>;
  llmOutputTokensTotal: Counter<'provider' | 'model'>;
  llmEstimatedCostMicrounitsTotal: Counter<'provider' | 'model'>;
  llmFallbacksTotal: Counter<'provider' | 'model'>;
  llmLatencyMs: Histogram<'provider' | 'model' | 'outcome'>;
  knowledgeRetrievalsTotal: Counter<'outcome'>;
  knowledgeResultsCount: Histogram<'outcome'>;
  knowledgeUsedTotal: Counter<'source'>;
};

declare global {
  var __AUTONOMOUS_API_METRICS__: MetricsState | undefined;
}

function isMetricsEnabled() {
  const value = process.env.METRICS_ENABLED?.trim().toLowerCase();
  return value !== 'false';
}

function getOrCreateMetricsState(): MetricsState {
  if (globalThis.__AUTONOMOUS_API_METRICS__) {
    return globalThis.__AUTONOMOUS_API_METRICS__;
  }

  const registry = new Registry();
  collectDefaultMetrics({
    register: registry,
    prefix: 'autonomous_api_',
  });

  const state: MetricsState = {
    registry,
    httpRequestsTotal: new Counter({
      name: METRIC_NAMES.httpRequestsTotal,
      help: 'Total HTTP requests handled by route and status class.',
      labelNames: ['method', 'route', 'statusClass'],
      registers: [registry],
    }),
    httpRequestDurationMs: new Histogram({
      name: METRIC_NAMES.httpRequestDurationMs,
      help: 'HTTP request duration in milliseconds.',
      labelNames: ['method', 'route', 'statusClass'],
      buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [registry],
    }),
    httpActiveRequests: new Gauge({
      name: METRIC_NAMES.httpActiveRequests,
      help: 'Currently active HTTP requests.',
      labelNames: ['route', 'method'],
      registers: [registry],
    }),
    authFailuresTotal: new Counter({
      name: METRIC_NAMES.authFailuresTotal,
      help: 'Authentication failures by flow and reason.',
      labelNames: ['flow', 'reason'],
      registers: [registry],
    }),
    authorizationDenialsTotal: new Counter({
      name: METRIC_NAMES.authorizationDenialsTotal,
      help: 'Authorization denials for authenticated requests.',
      registers: [registry],
    }),
    authLoginsTotal: new Counter({
      name: METRIC_NAMES.authLoginsTotal,
      help: 'Login operations by outcome.',
      labelNames: ['outcome'],
      registers: [registry],
    }),
    authRefreshTotal: new Counter({
      name: METRIC_NAMES.authRefreshTotal,
      help: 'Refresh token operations by outcome.',
      labelNames: ['outcome'],
      registers: [registry],
    }),
    authRegistrationsTotal: new Counter({
      name: METRIC_NAMES.authRegistrationsTotal,
      help: 'Registration operations by outcome.',
      labelNames: ['outcome'],
      registers: [registry],
    }),
    queueJobsEnqueuedTotal: new Counter({
      name: METRIC_NAMES.queueJobsEnqueuedTotal,
      help: 'Queue jobs enqueued.',
      labelNames: ['jobName', 'trigger'],
      registers: [registry],
    }),
    queueJobsStartedTotal: new Counter({
      name: METRIC_NAMES.queueJobsStartedTotal,
      help: 'Queue jobs started for processing.',
      labelNames: ['jobName'],
      registers: [registry],
    }),
    queueJobsCompletedTotal: new Counter({
      name: METRIC_NAMES.queueJobsCompletedTotal,
      help: 'Queue jobs completed.',
      labelNames: ['jobName'],
      registers: [registry],
    }),
    queueJobsFailedTotal: new Counter({
      name: METRIC_NAMES.queueJobsFailedTotal,
      help: 'Queue jobs failed.',
      labelNames: ['jobName', 'outcome'],
      registers: [registry],
    }),
    queueJobsRetriedTotal: new Counter({
      name: METRIC_NAMES.queueJobsRetriedTotal,
      help: 'Queue jobs retried.',
      labelNames: ['jobName', 'outcome'],
      registers: [registry],
    }),
    queueJobDurationMs: new Histogram({
      name: METRIC_NAMES.queueJobDurationMs,
      help: 'Queue job duration in milliseconds.',
      labelNames: ['jobName', 'outcome'],
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [registry],
    }),
    queueDeadLetteredTotal: new Counter({
      name: METRIC_NAMES.queueDeadLetteredTotal,
      help: 'Queue jobs sent to dead-letter handling.',
      labelNames: ['jobName', 'outcome'],
      registers: [registry],
    }),
    agentRunsTotal: new Counter({
      name: METRIC_NAMES.agentRunsTotal,
      help: 'Agent runs by status and trigger.',
      labelNames: ['status', 'trigger'],
      registers: [registry],
    }),
    agentRunDurationMs: new Histogram({
      name: METRIC_NAMES.agentRunDurationMs,
      help: 'Agent run duration in milliseconds.',
      labelNames: ['status'],
      buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [registry],
    }),
    agentStepsTotal: new Counter({
      name: METRIC_NAMES.agentStepsTotal,
      help: 'Agent steps by type and status.',
      labelNames: ['stepType', 'status'],
      registers: [registry],
    }),
    guardrailOutcomesTotal: new Counter({
      name: METRIC_NAMES.guardrailOutcomesTotal,
      help: 'Guardrail outcomes.',
      labelNames: ['guardrailType', 'decision'],
      registers: [registry],
    }),
    approvalsRequiredTotal: new Counter({
      name: METRIC_NAMES.approvalsRequiredTotal,
      help: 'Runs requiring human approval by source.',
      labelNames: ['source'],
      registers: [registry],
    }),
    draftsCreatedTotal: new Counter({
      name: METRIC_NAMES.draftsCreatedTotal,
      help: 'Drafts created by source.',
      labelNames: ['source'],
      registers: [registry],
    }),
    draftsSentTotal: new Counter({
      name: METRIC_NAMES.draftsSentTotal,
      help: 'Drafts sent by source.',
      labelNames: ['source'],
      registers: [registry],
    }),
    llmCallsTotal: new Counter({
      name: METRIC_NAMES.llmCallsTotal,
      help: 'LLM calls by provider, model, and outcome.',
      labelNames: ['provider', 'model', 'outcome'],
      registers: [registry],
    }),
    llmInputTokensTotal: new Counter({
      name: METRIC_NAMES.llmInputTokensTotal,
      help: 'LLM input tokens by provider and model.',
      labelNames: ['provider', 'model'],
      registers: [registry],
    }),
    llmOutputTokensTotal: new Counter({
      name: METRIC_NAMES.llmOutputTokensTotal,
      help: 'LLM output tokens by provider and model.',
      labelNames: ['provider', 'model'],
      registers: [registry],
    }),
    llmEstimatedCostMicrounitsTotal: new Counter({
      name: METRIC_NAMES.llmEstimatedCostMicrounitsTotal,
      help: 'Estimated LLM cost in integer microunits.',
      labelNames: ['provider', 'model'],
      registers: [registry],
    }),
    llmFallbacksTotal: new Counter({
      name: METRIC_NAMES.llmFallbacksTotal,
      help: 'LLM fallbacks used.',
      labelNames: ['provider', 'model'],
      registers: [registry],
    }),
    llmLatencyMs: new Histogram({
      name: METRIC_NAMES.llmLatencyMs,
      help: 'LLM latency in milliseconds.',
      labelNames: ['provider', 'model', 'outcome'],
      buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [registry],
    }),
    knowledgeRetrievalsTotal: new Counter({
      name: METRIC_NAMES.knowledgeRetrievalsTotal,
      help: 'Knowledge retrieval calls by outcome.',
      labelNames: ['outcome'],
      registers: [registry],
    }),
    knowledgeResultsCount: new Histogram({
      name: METRIC_NAMES.knowledgeResultsCount,
      help: 'Knowledge retrieval result count distribution.',
      labelNames: ['outcome'],
      buckets: [0, 1, 2, 3, 5, 10, 20],
      registers: [registry],
    }),
    knowledgeUsedTotal: new Counter({
      name: METRIC_NAMES.knowledgeUsedTotal,
      help: 'Knowledge-backed responses by source.',
      labelNames: ['source'],
      registers: [registry],
    }),
  };

  globalThis.__AUTONOMOUS_API_METRICS__ = state;
  return state;
}

@Injectable()
export class MetricsService {
  private readonly state = getOrCreateMetricsState();

  static resetForTests() {
    globalThis.__AUTONOMOUS_API_METRICS__?.registry.clear();
    globalThis.__AUTONOMOUS_API_METRICS__ = undefined;
  }

  isEnabled() {
    return isMetricsEnabled();
  }

  isAuthorized(authHeader?: string | null) {
    const token = process.env.METRICS_AUTH_TOKEN?.trim();
    if (!token) {
      return true;
    }

    return authHeader === `Bearer ${token}`;
  }

  async render() {
    return this.state.registry.metrics();
  }

  getContentType() {
    return this.state.registry.contentType;
  }

  startHttpRequest(method: string, route: string) {
    if (!this.isEnabled()) {
      return () => undefined;
    }

    this.state.httpActiveRequests.labels(route, method).inc();
    return () => this.state.httpActiveRequests.labels(route, method).dec();
  }

  recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    if (!this.isEnabled()) {
      return;
    }

    const statusClass = toStatusClass(input.statusCode);
    this.state.httpRequestsTotal
      .labels(input.method, input.route, statusClass)
      .inc();
    this.state.httpRequestDurationMs
      .labels(input.method, input.route, statusClass)
      .observe(input.durationMs);
  }

  incrementAuthFailure(flow: string, reason: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.authFailuresTotal
      .labels(flow, normalizeMetricOutcome(reason))
      .inc();
  }

  incrementAuthorizationDenied() {
    if (!this.isEnabled()) {
      return;
    }

    this.state.authorizationDenialsTotal.inc();
  }

  incrementAuthRefresh(outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.authRefreshTotal.labels(normalizeMetricOutcome(outcome)).inc();
  }

  incrementAuthLogin(outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.authLoginsTotal.labels(normalizeMetricOutcome(outcome)).inc();
  }

  incrementAuthRegistration(outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.authRegistrationsTotal.labels(normalizeMetricOutcome(outcome)).inc();
  }

  incrementQueueEnqueued(jobName: string, trigger: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobsEnqueuedTotal.labels(jobName, trigger).inc();
  }

  incrementQueueStarted(jobName: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobsStartedTotal.labels(jobName).inc();
  }

  incrementQueueCompleted(jobName: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobsCompletedTotal.labels(jobName).inc();
  }

  incrementQueueFailed(jobName: string, outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobsFailedTotal
      .labels(jobName, normalizeMetricOutcome(outcome))
      .inc();
  }

  incrementQueueRetried(jobName: string, outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobsRetriedTotal
      .labels(jobName, normalizeMetricOutcome(outcome))
      .inc();
  }

  observeQueueDuration(jobName: string, outcome: string, durationMs: number) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueJobDurationMs
      .labels(jobName, normalizeMetricOutcome(outcome))
      .observe(durationMs);
  }

  incrementDeadLetter(jobName: string, outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.queueDeadLetteredTotal
      .labels(jobName, normalizeMetricOutcome(outcome))
      .inc();
  }

  incrementAgentRun(status: string, trigger: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.agentRunsTotal.labels(status, trigger).inc();
  }

  observeAgentRunDuration(status: string, durationMs: number) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.agentRunDurationMs.labels(status).observe(durationMs);
  }

  incrementAgentStep(stepType: string, status: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.agentStepsTotal.labels(stepType, status).inc();
  }

  incrementGuardrailOutcome(guardrailType: string, decision: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.guardrailOutcomesTotal.labels(guardrailType, decision).inc();
  }

  incrementApprovalRequired(source: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.approvalsRequiredTotal.labels(source).inc();
  }

  incrementDraftCreated(source: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.draftsCreatedTotal.labels(source).inc();
  }

  incrementDraftSent(source: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.draftsSentTotal.labels(source).inc();
  }

  recordLlmCall(provider: string, model: string, outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.llmCallsTotal
      .labels(provider, model, normalizeMetricOutcome(outcome))
      .inc();
  }

  observeLlmLatency(
    provider: string,
    model: string,
    outcome: string,
    durationMs: number,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.llmLatencyMs
      .labels(provider, model, normalizeMetricOutcome(outcome))
      .observe(durationMs);
  }

  recordLlmUsage(input: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostMicrounits?: number | null;
  }) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.llmInputTokensTotal
      .labels(input.provider, input.model)
      .inc(input.inputTokens);
    this.state.llmOutputTokensTotal
      .labels(input.provider, input.model)
      .inc(input.outputTokens);

    if (input.estimatedCostMicrounits != null) {
      this.state.llmEstimatedCostMicrounitsTotal
        .labels(input.provider, input.model)
        .inc(input.estimatedCostMicrounits);
    }
  }

  incrementLlmFallback(provider: string, model: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.llmFallbacksTotal.labels(provider, model).inc();
  }

  incrementKnowledgeRetrieval(outcome: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.knowledgeRetrievalsTotal
      .labels(normalizeMetricOutcome(outcome))
      .inc();
  }

  observeKnowledgeResults(outcome: string, resultCount: number) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.knowledgeResultsCount
      .labels(normalizeMetricOutcome(outcome))
      .observe(resultCount);
  }

  incrementKnowledgeUsed(source: string) {
    if (!this.isEnabled()) {
      return;
    }

    this.state.knowledgeUsedTotal.labels(source).inc();
  }
}
