import { GuardrailDecision, GuardrailType } from '@agentic-support/db';
import { GuardrailService } from './guardrail.service';
import { GuardrailContext } from './guardrail.types';

describe('GuardrailService', () => {
  function createService() {
    const prisma = {
      agentGuardrailCheck: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(
        async (arg: unknown[] | ((tx: unknown) => Promise<unknown>)) => {
          if (typeof arg === 'function') return arg(prisma);
          return Promise.all(arg as Promise<unknown>[]);
        },
      ),
    };

    return {
      prisma,
      service: new GuardrailService(prisma as never),
    };
  }

  function baseCtx(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
    return {
      orgId: 'org_1',
      ticketId: 'ticket_1',
      agentRunId: 'run_1',
      draftBody: 'Thank you for reaching out. We will look into this shortly.',
      resolverConfidence: 0.94,
      usedKnowledgeArticleIds: ['article_1'],
      criticPassed: true,
      criticSafetyVerdict: 'safe',
      criticCompletenessScore: 0.91,
      estimatedCostCents: 5,
      settings: {
        maxAutoSendCostCents: 25,
        requireApprovalForLowConfidence: true,
        blockOnPiiDetection: true,
        minCriticCompletenessScore: 70,
      },
      ...overrides,
    };
  }

  it('returns ALLOW when all checks pass', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(baseCtx());

    expect(aggregate).toBe(GuardrailDecision.ALLOW);
    expect(checks.every((c) => c.decision === GuardrailDecision.ALLOW)).toBe(true);
  });

  it('blocks when critic safetyVerdict is blocked', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ criticSafetyVerdict: 'blocked' }),
    );

    expect(aggregate).toBe(GuardrailDecision.BLOCK);
    const safetyCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.SAFETY_POLICY,
    );
    expect(safetyCheck?.decision).toBe(GuardrailDecision.BLOCK);
  });

  it('blocks when completeness score is below threshold', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ criticPassed: false, criticCompletenessScore: 0.2 }),
    );

    expect(aggregate).toBe(GuardrailDecision.BLOCK);
    const safetyCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.SAFETY_POLICY,
    );
    expect(safetyCheck?.decision).toBe(GuardrailDecision.BLOCK);
    expect(safetyCheck?.reason).toContain('20%');
  });

  it('requires approval when critic fails but completeness is above threshold', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ criticPassed: false, criticCompletenessScore: 0.85 }),
    );

    const safetyCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.SAFETY_POLICY,
    );
    expect(safetyCheck?.decision).toBe(GuardrailDecision.REQUIRE_APPROVAL);
    expect(aggregate).toBe(GuardrailDecision.REQUIRE_APPROVAL);
  });

  it('requires approval when cost exceeds auto-send limit', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ estimatedCostCents: 30 }),
    );

    const costCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.COST_LIMIT,
    );
    expect(costCheck?.decision).toBe(GuardrailDecision.REQUIRE_APPROVAL);
    expect(aggregate).toBe(GuardrailDecision.REQUIRE_APPROVAL);
  });

  it('requires approval when no knowledge articles used', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ usedKnowledgeArticleIds: [] }),
    );

    const groundingCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.KNOWLEDGE_GROUNDING,
    );
    expect(groundingCheck?.decision).toBe(GuardrailDecision.REQUIRE_APPROVAL);
    expect(aggregate).toBe(GuardrailDecision.REQUIRE_APPROVAL);
  });

  it('blocks on PII detection when blockOnPiiDetection is true', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ draftBody: 'Your SSN 123-45-6789 was processed.' }),
    );

    const piiCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.PII_DETECTION,
    );
    expect(piiCheck?.decision).toBe(GuardrailDecision.BLOCK);
    expect(aggregate).toBe(GuardrailDecision.BLOCK);
  });

  it('requires approval on PII when blockOnPiiDetection is false', async () => {
    const { service } = createService();
    const { checks } = await service.runAll(
      baseCtx({
        draftBody: 'Your SSN 123-45-6789 was processed.',
        settings: {
          maxAutoSendCostCents: 25,
          requireApprovalForLowConfidence: true,
          blockOnPiiDetection: false,
          minCriticCompletenessScore: 70,
        },
      }),
    );

    const piiCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.PII_DETECTION,
    );
    expect(piiCheck?.decision).toBe(GuardrailDecision.REQUIRE_APPROVAL);
  });

  it('blocks on secret detection regardless of settings', async () => {
    const { service } = createService();
    const { aggregate, checks } = await service.runAll(
      baseCtx({ draftBody: 'Use this key: sk-abc123defghijklmnopqrstuvwxyz' }),
    );

    const secretCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.SECRET_DETECTION,
    );
    expect(secretCheck?.decision).toBe(GuardrailDecision.BLOCK);
    expect(aggregate).toBe(GuardrailDecision.BLOCK);
  });

  it('requires approval when confidence is low and setting is enabled', async () => {
    const { service } = createService();
    const { checks } = await service.runAll(
      baseCtx({ resolverConfidence: 0.5 }),
    );

    const autoSendCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.AUTO_SEND_POLICY,
    );
    expect(autoSendCheck?.decision).toBe(GuardrailDecision.REQUIRE_APPROVAL);
  });

  it('allows low confidence when requireApprovalForLowConfidence is false', async () => {
    const { service } = createService();
    const { checks } = await service.runAll(
      baseCtx({
        resolverConfidence: 0.5,
        settings: {
          maxAutoSendCostCents: 25,
          requireApprovalForLowConfidence: false,
          blockOnPiiDetection: true,
          minCriticCompletenessScore: 70,
        },
      }),
    );

    const autoSendCheck = checks.find(
      (c) => c.guardrailType === GuardrailType.AUTO_SEND_POLICY,
    );
    expect(autoSendCheck?.decision).toBe(GuardrailDecision.ALLOW);
  });

  it('persists all checks to the database', async () => {
    const { service, prisma } = createService();
    await service.runAll(baseCtx());

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.agentGuardrailCheck.create).toHaveBeenCalledTimes(6);
  });

  it('aggregate BLOCK takes precedence over REQUIRE_APPROVAL', async () => {
    const { service } = createService();
    // secret in draft + no knowledge articles → both fire, BLOCK wins
    const { aggregate } = await service.runAll(
      baseCtx({
        draftBody: 'Use this key: sk-abc123defghijklmnopqrstuvwxyz',
        usedKnowledgeArticleIds: [],
      }),
    );

    expect(aggregate).toBe(GuardrailDecision.BLOCK);
  });
});
