// Workaround: LLM AgentEventType values are pending `prisma generate`.
// These string literals match the schema exactly.
// Remove after running: pnpm --filter @agentic-support/db db:generate
export const LlmEventType = {
  LLM_CALL_STARTED: 'LLM_CALL_STARTED',
  LLM_CALL_SUCCEEDED: 'LLM_CALL_SUCCEEDED',
  LLM_CALL_FAILED: 'LLM_CALL_FAILED',
  LLM_FALLBACK_USED: 'LLM_FALLBACK_USED',
  LLM_USAGE_RECORDED: 'LLM_USAGE_RECORDED',
} as const;
