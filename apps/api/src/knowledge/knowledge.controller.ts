import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateKnowledgeArticleDto,
  ListKnowledgeArticlesQueryDto,
  SearchKnowledgeDto,
  UpdateKnowledgeArticleDto,
} from './knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('articles')
  @ApiOperation({ summary: 'Create a knowledge article' })
  async createArticle(@Body() dto: CreateKnowledgeArticleDto) {
    return this.knowledgeService.createArticle(dto);
  }

  @Get('articles')
  @ApiOperation({ summary: 'List knowledge articles for an organization' })
  async listArticles(@Query() query: ListKnowledgeArticlesQueryDto) {
    return this.knowledgeService.listArticles(query);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get one knowledge article' })
  async getArticle(
    @Param('id') articleId: string,
    @Query('orgId') orgId = 'org_demo',
  ) {
    return this.knowledgeService.getArticle(articleId, orgId);
  }

  @Patch('articles/:id')
  @ApiOperation({ summary: 'Update a knowledge article' })
  async updateArticle(
    @Param('id') articleId: string,
    @Body() dto: UpdateKnowledgeArticleDto,
  ) {
    return this.knowledgeService.updateArticle(articleId, dto);
  }

  @Delete('articles/:id')
  @ApiOperation({ summary: 'Archive a knowledge article' })
  async archiveArticle(
    @Param('id') articleId: string,
    @Query('orgId') orgId = 'org_demo',
  ) {
    return this.knowledgeService.archiveArticle(articleId, orgId);
  }

  @Post('search')
  @ApiOperation({ summary: 'Search published knowledge articles' })
  async search(@Body() dto: SearchKnowledgeDto) {
    return this.knowledgeService.search(dto);
  }
}
