import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';

@ApiTags('channel-webhooks')
@Controller('webhooks/channels')
export class ChannelWebhooksController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post(':connectionPublicId')
  @ApiOperation({ summary: 'Receive a signed provider channel webhook' })
  receiveWebhook(
    @Param('connectionPublicId') connectionPublicId: string,
    @Headers('x-channel-signature') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    return this.channelsService.ingestWebhook(
      connectionPublicId,
      payload,
      signature,
    );
  }
}
