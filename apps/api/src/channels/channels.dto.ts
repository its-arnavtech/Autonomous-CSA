import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChannelProvider } from '@agentic-support/db';

export class CreateChannelConnectionDto {
  @IsEnum(ChannelProvider)
  provider!: ChannelProvider;

  @IsString()
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  externalAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  inboundAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookSecret?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateChannelConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  inboundAddress?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
