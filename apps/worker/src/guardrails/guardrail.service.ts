import { Injectable } from '@nestjs/common';
import { GuardrailDecision, GuardrailType, Prisma } from '@agentic-support/db';
import { PrismaService } from '../prisma.service';
import {
  GuardrailCheckResult,
  GuardrailContext,
  GuardrailRunResult,
} from './guardrail.types';
import { detectPii } from './pii-detector';
import { detectSecrets } from './secret-detector';

const DECISION_RANK: Record<GuardrailDecision, number> = {
  [GuardrailDecision.ALLOW]: 0,
  [GuardrailDecision.REQUIRE_APPROVAL]: 1,
  [GuardrailDecision.BLOCK]: 2,
};

@Injectable()
export class GuardrailService {
  constructor(private readonly prisma: PrismaService) {}

  async runAll(ctx: GuardrailContext): Promise<GuardrailRunResult> {
    const checks: GuardrailCheckResult[] = [
      this.checkSafetyPolicy(ctx),
      this.checkCostLimit(ctx),
      this.checkKnowledgeGrounding(ctx),
      this.checkPiiDetection(ctx),
      this.checkSecretDetection(ctx),
      this.checkAutoSendPolicy(ctx),
    ];

    let aggregate: GuardrailDecision = GuardrailDecision.ALLOW;
    for (const check of checks) {
      if (DECISION_RANK[check.decision] > DECISION_RANK[aggregate]) {
        aggregate = check.decision;
      }
    }

    await this.persistChecks(ctx, checks);

    return { checks, aggregate };
  }

  private checkSafetyPolicy(ctx: GuardrailContext): GuardrailCheckResult {
    const { criticPassed, criticSafetyVerdict, criticCompletenessScore, settings } = ctx;

    if (criticSafetyVerdict === 'blocked') {
      return {
        guardrailType: GuardrailType.SAFETY_POLICY,
        decision: GuardrailDecision.BLOCK,
        reason: 'Critic flagged content as blocked',
      };
    }

    const completenessPercent = Math.round(criticCompletenessScore * 100);
    if (!criticPassed && completenessPercent < settings.minCriticCompletenessScore) {
      return {
        guardrailType: GuardrailType.SAFETY_POLICY,
        decision: GuardrailDecision.BLOCK,
        reason: `Completeness score ${completenessPercent}% below threshold ${settings.minCriticCompletenessScore}%`,
        metadata: { completenessPercent, threshold: settings.minCriticCompletenessScore },
      };
    }

    if (!criticPassed) {
      return {
        guardrailType: GuardrailType.SAFETY_POLICY,
        decision: GuardrailDecision.REQUIRE_APPROVAL,
        reason: 'Critic did not pass; human review required',
        metadata: { completenessPercent, issues: [] },
      };
    }

    return {
      guardrailType: GuardrailType.SAFETY_POLICY,
      decision: GuardrailDecision.ALLOW,
      reason: 'Safety policy passed',
    };
  }

  private checkCostLimit(ctx: GuardrailContext): GuardrailCheckResult {
    const { estimatedCostCents, settings } = ctx;

    if (estimatedCostCents > settings.maxAutoSendCostCents) {
      return {
        guardrailType: GuardrailType.COST_LIMIT,
        decision: GuardrailDecision.REQUIRE_APPROVAL,
        reason: `Estimated cost ${estimatedCostCents}¢ exceeds auto-send limit ${settings.maxAutoSendCostCents}¢`,
        metadata: {
          estimatedCostCents,
          maxAutoSendCostCents: settings.maxAutoSendCostCents,
        },
      };
    }

    return {
      guardrailType: GuardrailType.COST_LIMIT,
      decision: GuardrailDecision.ALLOW,
      reason: `Cost ${estimatedCostCents}¢ within limit`,
    };
  }

  private checkKnowledgeGrounding(ctx: GuardrailContext): GuardrailCheckResult {
    const { usedKnowledgeArticleIds } = ctx;

    if (usedKnowledgeArticleIds.length === 0) {
      return {
        guardrailType: GuardrailType.KNOWLEDGE_GROUNDING,
        decision: GuardrailDecision.REQUIRE_APPROVAL,
        reason: 'Response not grounded in any knowledge base articles',
      };
    }

    return {
      guardrailType: GuardrailType.KNOWLEDGE_GROUNDING,
      decision: GuardrailDecision.ALLOW,
      reason: `Grounded in ${usedKnowledgeArticleIds.length} article(s)`,
      metadata: { articleIds: usedKnowledgeArticleIds },
    };
  }

  private checkPiiDetection(ctx: GuardrailContext): GuardrailCheckResult {
    const { draftBody, settings } = ctx;
    const { detected, types } = detectPii(draftBody);

    if (detected) {
      return {
        guardrailType: GuardrailType.PII_DETECTION,
        decision: settings.blockOnPiiDetection
          ? GuardrailDecision.BLOCK
          : GuardrailDecision.REQUIRE_APPROVAL,
        reason: `PII detected: ${types.join(', ')}`,
        metadata: { piiTypes: types },
      };
    }

    return {
      guardrailType: GuardrailType.PII_DETECTION,
      decision: GuardrailDecision.ALLOW,
      reason: 'No PII detected',
    };
  }

  private checkSecretDetection(ctx: GuardrailContext): GuardrailCheckResult {
    const { draftBody } = ctx;
    const { detected, types } = detectSecrets(draftBody);

    if (detected) {
      return {
        guardrailType: GuardrailType.SECRET_DETECTION,
        decision: GuardrailDecision.BLOCK,
        reason: `Secrets detected: ${types.join(', ')}`,
        metadata: { secretTypes: types },
      };
    }

    return {
      guardrailType: GuardrailType.SECRET_DETECTION,
      decision: GuardrailDecision.ALLOW,
      reason: 'No secrets detected',
    };
  }

  private checkAutoSendPolicy(ctx: GuardrailContext): GuardrailCheckResult {
    const { resolverConfidence, settings } = ctx;

    if (settings.requireApprovalForLowConfidence && resolverConfidence < 0.7) {
      return {
        guardrailType: GuardrailType.AUTO_SEND_POLICY,
        decision: GuardrailDecision.REQUIRE_APPROVAL,
        reason: `Resolver confidence ${resolverConfidence.toFixed(2)} below threshold 0.70`,
        metadata: { resolverConfidence },
      };
    }

    return {
      guardrailType: GuardrailType.AUTO_SEND_POLICY,
      decision: GuardrailDecision.ALLOW,
      reason: 'Confidence sufficient for auto-send',
    };
  }

  private async persistChecks(
    ctx: GuardrailContext,
    checks: GuardrailCheckResult[],
  ) {
    await this.prisma.$transaction(
      checks.map((check) =>
        this.prisma.agentGuardrailCheck.create({
          data: {
            orgId: ctx.orgId,
            ticketId: ctx.ticketId,
            agentRunId: ctx.agentRunId,
            guardrailType: check.guardrailType,
            decision: check.decision,
            reason: check.reason ?? null,
            metadata:
              check.metadata != null
                ? (check.metadata as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
          },
        }),
      ),
    );
  }
}
