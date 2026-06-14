import { CriticAgent } from './critic.agent';

describe('CriticAgent', () => {
  const agent = new CriticAgent();

  it('passes a normal draft', () => {
    const output = agent.review({
      retrieval: {
        query: 'billing details',
        resultCount: 0,
        results: [],
      },
      resolver: {
        draftBody:
          'Thanks for reaching out. We are reviewing the billing details you shared and will follow up shortly.',
        resolutionSummary: 'billing',
        confidence: 0.9,
        usedKnowledgeArticleIds: [],
      },
    });

    expect(output.passed).toBe(true);
  });

  it('blocks an unsafe or too-short draft', () => {
    const output = agent.review({
      retrieval: {
        query: 'bad draft',
        resultCount: 0,
        results: [],
      },
      resolver: {
        draftBody: '[placeholder]',
        resolutionSummary: 'bad',
        confidence: 0.4,
        usedKnowledgeArticleIds: [],
      },
    });

    expect(output.passed).toBe(false);
    expect(output.safetyVerdict).toBe('blocked');
  });

  it('flags missing knowledge usage when retrieval found relevant context', () => {
    const output = agent.review({
      retrieval: {
        query: 'duplicate invoice charge',
        resultCount: 1,
        results: [
          {
            articleId: 'article_1',
            title: 'Duplicate invoice charge policy',
            snippet: 'Confirm invoice ID.',
            score: 24,
            tags: ['billing'],
          },
        ],
      },
      resolver: {
        draftBody:
          'Thanks for reaching out. We are reviewing the billing details you shared and will follow up shortly.',
        resolutionSummary: 'billing',
        confidence: 0.9,
        usedKnowledgeArticleIds: [],
      },
    });

    expect(output.passed).toBe(false);
    expect(output.issues).toContain(
      'Retrieved context was available but not used',
    );
  });
});
