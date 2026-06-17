export const METRIC_NAMES = {
  httpRequestsTotal: 'autonomous_http_requests_total',
  httpRequestDurationMs: 'autonomous_http_request_duration_ms',
  httpActiveRequests: 'autonomous_http_active_requests',
  authFailuresTotal: 'autonomous_auth_failures_total',
  authorizationDenialsTotal: 'autonomous_authorization_denials_total',
  authLoginsTotal: 'autonomous_auth_logins_total',
  authRefreshTotal: 'autonomous_auth_refresh_total',
  authRegistrationsTotal: 'autonomous_auth_registrations_total',
  queueJobsEnqueuedTotal: 'autonomous_queue_jobs_enqueued_total',
  queueJobsStartedTotal: 'autonomous_queue_jobs_started_total',
  queueJobsCompletedTotal: 'autonomous_queue_jobs_completed_total',
  queueJobsFailedTotal: 'autonomous_queue_jobs_failed_total',
  queueJobsRetriedTotal: 'autonomous_queue_jobs_retried_total',
  queueJobDurationMs: 'autonomous_queue_job_duration_ms',
  queueDeadLetteredTotal: 'autonomous_queue_dead_lettered_total',
  agentRunsTotal: 'autonomous_agent_runs_total',
  agentRunDurationMs: 'autonomous_agent_run_duration_ms',
  agentStepsTotal: 'autonomous_agent_steps_total',
  guardrailOutcomesTotal: 'autonomous_guardrail_outcomes_total',
  approvalsRequiredTotal: 'autonomous_approvals_required_total',
  draftsCreatedTotal: 'autonomous_drafts_created_total',
  draftsSentTotal: 'autonomous_drafts_sent_total',
  llmCallsTotal: 'autonomous_llm_calls_total',
  llmInputTokensTotal: 'autonomous_llm_input_tokens_total',
  llmOutputTokensTotal: 'autonomous_llm_output_tokens_total',
  llmEstimatedCostMicrounitsTotal:
    'autonomous_llm_estimated_cost_microunits_total',
  llmFallbacksTotal: 'autonomous_llm_fallbacks_total',
  llmLatencyMs: 'autonomous_llm_latency_ms',
  knowledgeRetrievalsTotal: 'autonomous_knowledge_retrievals_total',
  knowledgeResultsCount: 'autonomous_knowledge_results_count',
  knowledgeUsedTotal: 'autonomous_knowledge_used_total',
  channelWebhooksTotal: 'autonomous_channel_webhooks_total',
  channelWebhookSignatureFailuresTotal:
    'autonomous_channel_webhook_signature_failures_total',
  channelDuplicateWebhooksTotal:
    'autonomous_channel_duplicate_webhooks_total',
  channelInboundMessagesTotal: 'autonomous_channel_inbound_messages_total',
  channelConversationsCreatedTotal:
    'autonomous_channel_conversations_created_total',
  channelTicketsCreatedTotal:
    'autonomous_channel_tickets_created_total',
  channelOutboundQueuedTotal:
    'autonomous_channel_outbound_queued_total',
} as const;

export const METRIC_OUTCOMES = [
  'success',
  'blocked',
  'timeout',
  'rate_limited',
  'provider_error',
  'validation_error',
  'auth_error',
  'authorization_denied',
  'configuration_error',
  'no_result',
  'unknown',
] as const;

export type MetricOutcome = (typeof METRIC_OUTCOMES)[number];

export function toStatusClass(statusCode: number) {
  return `${Math.floor(statusCode / 100)}xx`;
}

export function normalizeMetricOutcome(value?: string | null): MetricOutcome {
  if (!value) {
    return 'unknown';
  }

  return METRIC_OUTCOMES.includes(value as MetricOutcome)
    ? (value as MetricOutcome)
    : 'unknown';
}
