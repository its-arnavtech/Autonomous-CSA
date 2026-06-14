import { Injectable } from '@nestjs/common';
import {
  KnowledgeArticleStatus,
  buildKnowledgeSearchQuery,
  rankKnowledgeArticles,
} from '@agentic-support/db';
import { PrismaService } from '../prisma.service';
import { RetrieverOutput, RouterOutput } from './agent-runtime.types';

@Injectable()
export class RetrieverAgent {
  constructor(private readonly prisma: PrismaService) {}

  async retrieve(input: {
    orgId: string;
    subject: string;
    body: string;
    router: RouterOutput;
  }): Promise<RetrieverOutput> {
    const query = buildKnowledgeSearchQuery([
      input.subject,
      input.body,
      input.router.category,
      input.router.intent,
      input.router.notes,
    ]);

    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        orgId: input.orgId,
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const results = rankKnowledgeArticles({
      articles,
      query,
      limit: 5,
    });

    return {
      query,
      results,
      resultCount: results.length,
    };
  }
}
