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
import { SupportService } from '../support/support.service';
import {
  CreateKnowledgeArticleDto,
  ListKnowledgeArticlesQueryDto,
  SearchKnowledgeDto,
  UpdateKnowledgeArticleDto,
} from './knowledge.dto';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportService: SupportService,
  ) {}

  async createArticle(dto: CreateKnowledgeArticleDto) {
    const organization = await this.supportService.resolveOrganization(
      dto.orgId,
    );

    return this.prisma.knowledgeArticle.create({
      data: {
        orgId: organization.id,
        title: dto.title.trim(),
        body: dto.body.trim(),
        tags: this.normalizeTags(dto.tags),
        status: dto.status ?? KnowledgeArticleStatus.DRAFT,
      },
    });
  }

  async listArticles(query: ListKnowledgeArticlesQueryDto) {
    const organization = await this.supportService.resolveOrganization(
      query.orgId ?? 'org_demo',
    );
    const q = query.q?.trim();
    const tokens = q
      ? q
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .filter(Boolean)
      : [];

    const where: Prisma.KnowledgeArticleWhereInput = {
      orgId: organization.id,
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

  async getArticle(articleId: string, orgSlug = 'org_demo') {
    const organization = await this.supportService.resolveOrganization(orgSlug);
    const article = await this.prisma.knowledgeArticle.findFirst({
      where: { id: articleId, orgId: organization.id },
    });

    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }

    return article;
  }

  async updateArticle(articleId: string, dto: UpdateKnowledgeArticleDto) {
    const article = await this.getArticle(articleId, dto.orgId);
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

  async archiveArticle(articleId: string, orgSlug = 'org_demo') {
    const article = await this.getArticle(articleId, orgSlug);

    return this.prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { status: KnowledgeArticleStatus.ARCHIVED },
    });
  }

  async search(dto: SearchKnowledgeDto) {
    const organization = await this.supportService.resolveOrganization(
      dto.orgId,
    );
    const query = buildKnowledgeSearchQuery([dto.query]);
    if (!query) {
      throw new BadRequestException(
        'Search query must contain searchable terms',
      );
    }

    const articles = await this.prisma.knowledgeArticle.findMany({
      where: {
        orgId: organization.id,
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
