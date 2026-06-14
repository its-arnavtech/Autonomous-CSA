import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupportService } from '../support/support.service';
import { DraftOrgQueryDto, SendDraftDto, UpdateDraftDto } from './drafts.dto';

@ApiTags('drafts')
@Controller('drafts')
export class DraftsController {
  constructor(private readonly supportService: SupportService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get one outbound draft' })
  async getDraft(
    @Param('id') draftId: string,
    @Query() query: DraftOrgQueryDto,
  ) {
    return this.supportService.getDraftDetail(
      draftId,
      query.orgId ?? 'org_demo',
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an outbound draft' })
  async updateDraft(@Param('id') draftId: string, @Body() dto: UpdateDraftDto) {
    return this.supportService.editDraft(draftId, dto.orgId, dto.body);
  }

  @Post(':id/send')
  @ApiOperation({
    summary: 'Send an approved outbound draft as an outbound message',
  })
  async sendDraft(@Param('id') draftId: string, @Body() dto: SendDraftDto) {
    return this.supportService.sendDraft(draftId, dto.orgId);
  }
}
