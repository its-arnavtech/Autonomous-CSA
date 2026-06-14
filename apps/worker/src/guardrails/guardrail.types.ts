import { GuardrailDecision, GuardrailType } from '@agentic-support/db';

export type GuardrailPolicySettings = {
  maxAutoSendCostCents: number;
  requireApprovalForLowConfidence: boolean;
  blockOnPiiDetection: boolean;
  minCriticCompletenessScore: number;
};

export type GuardrailContext = {
  orgId: string;
  ticketId: string;
  agentRunId: string;
  draftBody: string;
  resolverConfidence: number;
  usedKnowledgeArticleIds: string[];
  criticPassed: boolean;
  criticSafetyVerdict: 'safe' | 'needs_review' | 'blocked';
  criticCompletenessScore: number;
  estimatedCostCents: number;
  settings: GuardrailPolicySettings;
};

export type GuardrailCheckResult = {
  guardrailType: GuardrailType;
  decision: GuardrailDecision;
  reason: string;
  metadata?: Record<string, unknown>;
};

export type GuardrailRunResult = {
  checks: GuardrailCheckResult[];
  aggregate: GuardrailDecision;
};
