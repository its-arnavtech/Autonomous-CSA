import {
  CriticOutput,
  ResolverOutput,
  RouterOutput,
} from '../agent-runtime/agent-runtime.types';

function formatUnknown(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const ROUTER_SYSTEM_PROMPT = `You are a customer support ticket router. Analyze the incoming ticket and respond with a JSON object only.

Required fields:
- category: one of "billing", "technical", "account", "general"
- intent: short snake_case string (e.g. "assist_billing_issue")
- urgency: one of "low", "normal", "high"
- confidence: number 0–1
- notes: one sentence explaining the routing decision

Respond with valid JSON only. No markdown, no code blocks, no extra text.`;

export function buildRouterUserPrompt(input: {
  subject: string;
  body: string;
}): string {
  return `Route this support ticket:
Subject: ${input.subject}
Body: ${(input.body ?? '').slice(0, 2000)}`;
}

export function validateRouterOutput(raw: unknown): RouterOutput {
  const r = raw as Record<string, unknown>;
  const validCategories = ['billing', 'technical', 'account', 'general'];

  if (!validCategories.includes(r.category as string)) {
    throw new Error(`invalid category: ${formatUnknown(r.category)}`);
  }
  if (typeof r.intent !== 'string' || !r.intent) {
    throw new Error('missing intent');
  }
  if (!['low', 'normal', 'high'].includes(r.urgency as string)) {
    throw new Error(`invalid urgency: ${formatUnknown(r.urgency)}`);
  }
  if (typeof r.confidence !== 'number') {
    throw new Error('missing confidence');
  }
  if (typeof r.notes !== 'string') {
    throw new Error('missing notes');
  }

  return {
    category: r.category as RouterOutput['category'],
    intent: r.intent,
    urgency: r.urgency as RouterOutput['urgency'],
    confidence: Math.max(0, Math.min(1, r.confidence)),
    notes: r.notes,
  };
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export const RESOLVER_SYSTEM_PROMPT = `You are a customer support agent. Draft a professional response to the support ticket.

Required fields:
- draftBody: the complete draft reply to the customer (2–5 sentences, professional tone, addressed to the customer)
- resolutionSummary: one-sentence internal summary of the approach
- confidence: number 0–1
- usedKnowledgeArticleIds: array of article IDs from provided snippets (empty array if none used)

Rules:
- Do not invent policies not mentioned in knowledge snippets
- Do not include internal IDs or system details in draftBody
- draftBody must address the customer directly, not an internal reviewer

Respond with valid JSON only. No markdown, no code blocks.`;

export function buildResolverUserPrompt(input: {
  subject: string;
  body: string;
  category: string;
  intent: string;
  knowledgeSnippets: Array<{
    articleId: string;
    title: string;
    snippet: string;
  }>;
}): string {
  const snippets =
    input.knowledgeSnippets.length > 0
      ? input.knowledgeSnippets
          .map((s) => `[${s.articleId}] ${s.title}: ${s.snippet}`)
          .join('\n')
      : 'No knowledge articles available.';

  return `Draft a response to this support ticket.

Category: ${input.category}
Intent: ${input.intent}

Customer Subject: ${input.subject}
Customer Message: ${(input.body ?? '').slice(0, 2000)}

Available Knowledge Articles:
${snippets}`;
}

export function validateResolverOutput(raw: unknown): ResolverOutput {
  const r = raw as Record<string, unknown>;

  if (typeof r.draftBody !== 'string' || r.draftBody.length < 10) {
    throw new Error('invalid or missing draftBody');
  }
  if (typeof r.resolutionSummary !== 'string') {
    throw new Error('missing resolutionSummary');
  }
  if (typeof r.confidence !== 'number') {
    throw new Error('missing confidence');
  }
  if (!Array.isArray(r.usedKnowledgeArticleIds)) {
    throw new Error('missing usedKnowledgeArticleIds');
  }

  return {
    draftBody: r.draftBody,
    resolutionSummary: r.resolutionSummary,
    confidence: Math.max(0, Math.min(1, r.confidence)),
    usedKnowledgeArticleIds: (r.usedKnowledgeArticleIds as unknown[]).filter(
      (id): id is string => typeof id === 'string',
    ),
  };
}

// ─── Critic ───────────────────────────────────────────────────────────────────

export const CRITIC_SYSTEM_PROMPT = `You are a quality reviewer for customer support draft responses.

Required fields:
- passed: boolean — whether the draft meets quality standards
- safetyVerdict: one of "safe", "needs_review", "blocked"
- completenessScore: number 0–1
- issues: array of strings (empty if passed)
- recommendedAction: one of "approve", "human_review", "revise"

Review criteria:
- Draft must not contain placeholder text, TODO markers, or internal system info
- Draft must be professional and relevant to the customer's issue
- Draft should use knowledge articles if applicable and available
- Draft must be at least 2 sentences

Respond with valid JSON only. No markdown, no code blocks.`;

export function buildCriticUserPrompt(input: {
  subject: string;
  draftBody: string;
  category: string;
  usedKnowledgeArticleIds: string[];
  knowledgeSnippets: Array<{
    articleId: string;
    title: string;
    snippet: string;
  }>;
}): string {
  const snippets =
    input.knowledgeSnippets.length > 0
      ? input.knowledgeSnippets
          .map((s) => `[${s.articleId}] ${s.title}: ${s.snippet}`)
          .join('\n')
      : 'No knowledge articles were available.';

  const usedIds =
    input.usedKnowledgeArticleIds.length > 0
      ? input.usedKnowledgeArticleIds.join(', ')
      : 'none';

  return `Review this draft customer support response.

Ticket Subject: ${input.subject}
Category: ${input.category}
Draft Used Knowledge Articles: ${usedIds}

Available Knowledge Snippets:
${snippets}

Draft Response to Review:
${input.draftBody.slice(0, 3000)}`;
}

export function validateCriticOutput(raw: unknown): CriticOutput {
  const r = raw as Record<string, unknown>;

  if (typeof r.passed !== 'boolean') {
    throw new Error('missing passed');
  }
  if (
    !['safe', 'needs_review', 'blocked'].includes(r.safetyVerdict as string)
  ) {
    throw new Error(`invalid safetyVerdict: ${formatUnknown(r.safetyVerdict)}`);
  }
  if (typeof r.completenessScore !== 'number') {
    throw new Error('missing completenessScore');
  }
  if (!Array.isArray(r.issues)) {
    throw new Error('missing issues');
  }
  if (
    !['approve', 'human_review', 'revise'].includes(
      r.recommendedAction as string,
    )
  ) {
    throw new Error(
      `invalid recommendedAction: ${formatUnknown(r.recommendedAction)}`,
    );
  }

  return {
    passed: r.passed,
    safetyVerdict: r.safetyVerdict as CriticOutput['safetyVerdict'],
    completenessScore: Math.max(0, Math.min(1, r.completenessScore)),
    issues: (r.issues as unknown[]).filter(
      (i): i is string => typeof i === 'string',
    ),
    recommendedAction: r.recommendedAction as CriticOutput['recommendedAction'],
  };
}
