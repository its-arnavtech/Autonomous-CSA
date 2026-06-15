import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganization } from '../auth/current-organization.decorator';
import type { TenantMembership } from '../auth/authenticated-user.type';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import {
  MANAGE_ORG_ROLES,
  READ_ORG_ROLES,
} from '../auth/organization-role.constants';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import {
  CreateKnowledgeArticleDto,
  ListKnowledgeArticlesQueryDto,
  SearchKnowledgeDto,
  UpdateKnowledgeArticleDto,
} from './knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard, TenantContextGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('articles')
  @ApiOperation({ summary: 'Create a knowledge article' })
  @Roles(...MANAGE_ORG_ROLES)
  async createArticle(
    @Body() dto: CreateKnowledgeArticleDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.createArticle(dto, organization.organizationId);
  }

  @Get('articles')
  @ApiOperation({ summary: 'List knowledge articles for an organization' })
  @Roles(...READ_ORG_ROLES)
  async listArticles(
    @Query() query: ListKnowledgeArticlesQueryDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.listArticles(query, organization.organizationId);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get one knowledge article' })
  @Roles(...READ_ORG_ROLES)
  async getArticle(
    @Param('id') articleId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.getArticle(articleId, organization.organizationId);
  }

  @Patch('articles/:id')
  @ApiOperation({ summary: 'Update a knowledge article' })
  @Roles(...MANAGE_ORG_ROLES)
  async updateArticle(
    @Param('id') articleId: string,
    @Body() dto: UpdateKnowledgeArticleDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.updateArticle(
      articleId,
      dto,
      organization.organizationId,
    );
  }

  @Delete('articles/:id')
  @ApiOperation({ summary: 'Archive a knowledge article' })
  @Roles(...MANAGE_ORG_ROLES)
  async archiveArticle(
    @Param('id') articleId: string,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.archiveArticle(
      articleId,
      organization.organizationId,
    );
  }

  @Post('search')
  @ApiOperation({ summary: 'Search published knowledge articles' })
  @Roles(...READ_ORG_ROLES)
  async search(
    @Body() dto: SearchKnowledgeDto,
    @CurrentOrganization() organization: TenantMembership,
  ) {
    return this.knowledgeService.search(dto, organization.organizationId);
  }
}
