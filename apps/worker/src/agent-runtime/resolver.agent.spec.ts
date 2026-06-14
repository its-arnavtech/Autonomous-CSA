import { ResolverAgent } from './resolver.agent';

describe('ResolverAgent', () => {
  const agent = new ResolverAgent();

  it('produces a non-empty draft', () => {
    const output = agent.resolve({
      subject: 'Billing issue',
      body: 'Payment failed.',
      router: {
        category: 'billing',
        intent: 'assist_billing_issue',
        urgency: 'normal',
        confidence: 0.9,
        notes: 'billing',
      },
      retrieval: {
        query: 'billing payment failed',
        resultCount: 0,
        results: [],
      },
    });

    expect(output.draftBody.length).toBeGreaterThan(20);
    expect(output.usedKnowledgeArticleIds).toEqual([]);
  });

  it('includes usedKnowledgeArticleIds when retrieval results exist', () => {
    const output = agent.resolve({
      subject: 'Duplicate invoice charge',
      body: 'I was charged twice.',
      router: {
        category: 'billing',
        intent: 'assist_billing_issue',
        urgency: 'normal',
        confidence: 0.9,
        notes: 'billing',
      },
      retrieval: {
        query: 'duplicate invoice charge billing',
        resultCount: 1,
        results: [
          {
            articleId: 'article_1',
            title: 'Duplicate invoice charge policy',
            snippet: 'Confirm the invoice ID and review payment records.',
            score: 28,
            tags: ['billing', 'invoice'],
          },
        ],
      },
    });

    expect(output.usedKnowledgeArticleIds).toEqual(['article_1']);
    expect(output.draftBody).toContain('duplicate invoice charge policy');
  });
});
