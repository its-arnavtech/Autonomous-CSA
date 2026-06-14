import { KnowledgeArticleStatus } from '@agentic-support/db';
import { RetrieverAgent } from './retriever.agent';

describe('RetrieverAgent', () => {
  function createAgent() {
    const prisma = {
      knowledgeArticle: {
        findMany: jest.fn(),
      },
    };

    return {
      prisma,
      agent: new RetrieverAgent(prisma as never),
    };
  }

  it('returns a matching billing article', async () => {
    const { agent, prisma } = createAgent();
    prisma.knowledgeArticle.findMany.mockResolvedValue([
      {
        id: 'article_1',
        title: 'Duplicate invoice charge policy',
        body: 'Confirm the invoice ID and review payment records.',
        tags: ['billing', 'invoice', 'payment'],
        status: KnowledgeArticleStatus.PUBLISHED,
        updatedAt: new Date('2026-06-14T10:00:00Z'),
      },
    ]);

    const result = await agent.retrieve({
      orgId: 'org_1',
      subject: 'Duplicate invoice charge',
      body: 'I was charged twice and need help.',
      router: {
        category: 'billing',
        intent: 'assist_billing_issue',
        urgency: 'normal',
        confidence: 0.9,
        notes: 'billing',
      },
    });

    expect(prisma.knowledgeArticle.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org_1',
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.resultCount).toBe(1);
    expect(result.results[0]?.articleId).toBe('article_1');
  });

  it('ignores draft and archived articles by querying only published ones', async () => {
    const { agent, prisma } = createAgent();
    prisma.knowledgeArticle.findMany.mockResolvedValue([]);

    const result = await agent.retrieve({
      orgId: 'org_1',
      subject: 'Password reset request',
      body: 'Need help with account access.',
      router: {
        category: 'account',
        intent: 'assist_account_request',
        urgency: 'normal',
        confidence: 0.9,
        notes: 'account',
      },
    });

    expect(result.resultCount).toBe(0);
    expect(result.results).toEqual([]);
  });
});
