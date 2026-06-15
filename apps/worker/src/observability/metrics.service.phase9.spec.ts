import { MetricsService } from './metrics.service';

describe('Phase 9 worker metrics', () => {
  beforeEach(() => {
    MetricsService.resetForTests();
  });

  afterEach(() => {
    MetricsService.resetForTests();
  });

  it('records queue, agent, guardrail, LLM, retrieval, and dead-letter metrics', async () => {
    const metrics = new MetricsService();

    metrics.incrementQueueStarted('ticket.process');
    metrics.incrementQueueCompleted('ticket.process');
    metrics.incrementQueueFailed('ticket.process', 'timeout');
    metrics.incrementQueueRetried('ticket.process', 'rate_limited');
    metrics.observeQueueDuration('ticket.process', 'success', 125);
    metrics.incrementDeadLetter('ticket.process', 'validation_error');

    metrics.incrementAgentRun('running', 'ticket_created');
    metrics.incrementAgentRun('success', 'ticket_created');
    metrics.observeAgentRunDuration('success', 250);
    metrics.incrementAgentStep('ROUTER', 'started');
    metrics.incrementAgentStep('CRITIC', 'blocked');
    metrics.incrementGuardrailOutcome('cost_limit', 'require_approval');
    metrics.incrementApprovalRequired('guardrail');
    metrics.incrementDraftCreated('agent');
    metrics.incrementDraftSent('user');

    metrics.recordLlmCall('openai', 'gpt-4o-mini', 'success');
    metrics.observeLlmLatency('openai', 'gpt-4o-mini', 'success', 90);
    metrics.recordLlmUsage({
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: 120,
      outputTokens: 80,
      estimatedCostMicrounits: 66,
    });
    metrics.incrementLlmFallback('openai', 'gpt-4o-mini');

    metrics.incrementKnowledgeRetrieval('no_result');
    metrics.observeKnowledgeResults('no_result', 0);
    metrics.incrementKnowledgeUsed('resolver');

    const rendered = await metrics.render();

    expect(rendered).toContain(
      'autonomous_queue_jobs_started_total{jobName="ticket.process"} 1',
    );
    expect(rendered).toContain(
      'autonomous_queue_jobs_failed_total{jobName="ticket.process",outcome="timeout"} 1',
    );
    expect(rendered).toContain(
      'autonomous_agent_runs_total{status="success",trigger="ticket_created"} 1',
    );
    expect(rendered).toContain(
      'autonomous_agent_steps_total{stepType="ROUTER",status="started"} 1',
    );
    expect(rendered).toContain(
      'autonomous_guardrail_outcomes_total{guardrailType="cost_limit",decision="require_approval"} 1',
    );
    expect(rendered).toContain(
      'autonomous_approvals_required_total{source="guardrail"} 1',
    );
    expect(rendered).toContain(
      'autonomous_llm_calls_total{provider="openai",model="gpt-4o-mini",outcome="success"} 1',
    );
    expect(rendered).toContain(
      'autonomous_llm_estimated_cost_microunits_total{provider="openai",model="gpt-4o-mini"} 66',
    );
    expect(rendered).toContain(
      'autonomous_knowledge_retrievals_total{outcome="no_result"} 1',
    );
    expect(rendered).toContain(
      'autonomous_knowledge_used_total{source="resolver"} 1',
    );
    expect(rendered).not.toContain('organizationId=');
    expect(rendered).not.toContain('ticketId=');
    expect(rendered).not.toContain('userId=');
    expect(rendered).not.toContain('correlationId=');
    expect(rendered).not.toContain('email=');
  });
});
