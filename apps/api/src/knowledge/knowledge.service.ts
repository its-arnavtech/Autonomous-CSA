import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KnowledgeArticleStatus,
  Prisma,
  buildKnowledgeSearchQuery,
  rankKnowledgeArticles,
} from '@agentic-support/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKnowledgeArticleDto,
  ListKnowledgeArticlesQueryDto,
  SearchKnowledgeDto,
  UpdateKnowledgeArticleDto,
} from './knowledge.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async createArticle(dto: CreateKnowledgeArticleDto, orgId: string) {
    return this.prisma.knowledgeArticle.create({
      data: {
        orgId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        tags: this.normalizeTags(dto.tags),
        status: dto.status ?? KnowledgeArticleStatus.DRAFT,
      },
    });
  }

  async listArticles(query: ListKnowledgeArticlesQueryDto, orgId: string) {
    const q = query.q?.trim();
    const tokens = q
      ? q
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .filter(Boolean)
      : [];

    const where: Prisma.KnowledgeArticleWhereInput = {
      orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(tokens.length > 0
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { body: { contains: q, mode: 'insensitive' } },
              { tags: { hasSome: tokens } },
            ],
          }
        : {}),
    };

    return this.prisma.knowledgeArticle.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getArticle(articleId: string, orgId: string) {
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id: articleId, orgId },
    });

    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }

    return article;
  }

  async updateArticle(
    articleId: string,
    dto: UpdateKnowledgeArticleDto,
    orgId: string,
  ) {
    const article = await this.getArticle(articleId, orgId);
    const data: Prisma.KnowledgeArticleUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }

    if (dto.body !== undefined) {
      data.body = dto.body.trim();
    }

    if (dto.tags !== undefined) {
      data.tags = this.normalizeTags(dto.tags);
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No knowledge article fields provided');
    }

    return this.prisma.knowledgeArticle.update({
      where: { id: article.id },
      data,
    });
  }

  async archiveArticle(articleId: string, orgId: string) {
    const article = await this.getArticle(articleId, orgId);

    return this.prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { status: KnowledgeArticleStatus.ARCHIVED },
    });
  }

  async search(dto: SearchKnowledgeDto, orgId: string) {
    const query = buildKnowledgeSearchQuery([dto.query]);
    if (!query) {
      throw new BadRequestException(
        'Search query must contain searchable terms',
      );
    }

    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        orgId,
        status: KnowledgeArticleStatus.PUBLISHED,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rankKnowledgeArticles({
      articles,
      query,
      limit: dto.limit ?? 5,
    });
  }

  private normalizeTags(tags?: string[]) {
    if (!tags) {
      return [] as string[];
    }

    return tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .filter((tag, index, values) => values.indexOf(tag) === index);
  }
}
