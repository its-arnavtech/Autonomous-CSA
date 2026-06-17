import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
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
    @Headers('content-type') contentType: string | undefined,
    @Body() payload: unknown,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException('Webhook payload must be JSON');
    }

    return this.channelsService.ingestWebhook(
      connectionPublicId,
      payload,
      signature,
      request.rawBody,
    );
  }
}
