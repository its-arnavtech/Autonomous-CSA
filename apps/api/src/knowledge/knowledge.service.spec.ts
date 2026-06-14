import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeArticleStatus } from '@agentic-support/db';
import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService', () => {
  function createService() {
    const prisma = {
      knowledgeArticle: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const supportService = {
      resolveOrganization: jest.fn(),
    };

    return {
      prisma,
      supportService,
      service: new KnowledgeService(prisma as never, supportService as never),
    };
  }

  it('creates a knowledge article for the resolved org', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.create.mockResolvedValue({ id: 'article_1' });

    await service.createArticle({
      orgId: 'org_demo',
      title: ' Duplicate invoice charge policy ',
      body: ' Billing workflow ',
      tags: ['Billing', 'invoice', 'billing'],
      status: KnowledgeArticleStatus.PUBLISHED,
    });

    expect(prisma.knowledgeArticle.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org_1',
        title: 'Duplicate invoice charge policy',
        body: 'Billing workflow',
        tags: ['billing', 'invoice'],
        status: KnowledgeArticleStatus.PUBLISHED,
      },
    });
  });

  it('lists only org-scoped articles', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findMany.mockResolvedValue([]);

    await service.listArticles({ orgId: 'org_demo' });

    expect(prisma.knowledgeArticle.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org_1' },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('archives an article instead of hard deleting it', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValue({
      id: 'article_1',
      orgId: 'org_1',
    });
    prisma.knowledgeArticle.update.mockResolvedValue({
      id: 'article_1',
      status: KnowledgeArticleStatus.ARCHIVED,
    });

    const article = await service.archiveArticle('article_1', 'org_demo');

    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith({
      where: { id: 'article_1' },
      data: { status: KnowledgeArticleStatus.ARCHIVED },
    });
    expect(article.status).toBe(KnowledgeArticleStatus.ARCHIVED);
  });

  it('search returns only published articles and prefers title/tag matches', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findMany.mockResolvedValue([
      {
        id: 'article_title',
        title: 'Duplicate invoice charge policy',
        body: 'Review billing records and confirm invoice identifiers.',
        tags: ['billing', 'invoice'],
        updatedAt: new Date('2026-06-14T10:00:00Z'),
      },
      {
        id: 'article_body',
        title: 'General support note',
        body: 'A duplicate invoice charge should be reviewed by billing.',
        tags: ['general'],
        updatedAt: new Date('2026-06-14T09:00:00Z'),
      },
    ]);

    const results = await service.search({
      orgId: 'org_demo',
      query: 'duplicate invoice billing charge',
      limit: 5,
    });

    expect(prisma.knowledgeArticle.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org_1',
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.articleId).toBe('article_title');
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('rejects empty searchable queries', async () => {
    const { service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });

    await expect(
      service.search({
        orgId: 'org_demo',
        query: '   ',
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents wrong org access to an article', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_2',
      slug: 'org_other',
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValue(null);

    await expect(
      service.getArticle('article_1', 'org_other'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an article title and normalizes tags', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValue({
      id: 'article_1',
      orgId: 'org_1',
    });
    prisma.knowledgeArticle.update.mockResolvedValue({
      id: 'article_1',
      title: 'Updated Title',
      tags: ['billing'],
    });

    const article = await service.updateArticle('article_1', {
      orgId: 'org_demo',
      title: ' Updated Title ',
      tags: ['Billing', 'BILLING'],
    });

    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith({
      where: { id: 'article_1' },
      data: {
        title: 'Updated Title',
        tags: ['billing'],
      },
    });
    expect(article.title).toBe('Updated Title');
  });

  it('rejects an update with no fields provided', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValue({
      id: 'article_1',
      orgId: 'org_1',
    });

    await expect(
      service.updateArticle('article_1', { orgId: 'org_demo' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates only the status when just status is provided', async () => {
    const { prisma, service, supportService } = createService();
    supportService.resolveOrganization.mockResolvedValue({
      id: 'org_1',
      slug: 'org_demo',
    });
    prisma.knowledgeArticle.findFirst.mockResolvedValue({
      id: 'article_1',
      orgId: 'org_1',
    });
    prisma.knowledgeArticle.update.mockResolvedValue({
      id: 'article_1',
      status: KnowledgeArticleStatus.PUBLISHED,
    });

    await service.updateArticle('article_1', {
      orgId: 'org_demo',
      status: KnowledgeArticleStatus.PUBLISHED,
    });

    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith({
      where: { id: 'article_1' },
      data: { status: KnowledgeArticleStatus.PUBLISHED },
    });
  });
});
