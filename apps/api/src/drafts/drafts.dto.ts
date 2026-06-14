import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDraftDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class UpdateDraftDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class SendDraftDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;
}

export class DraftOrgQueryDto {
  @ApiPropertyOptional({ default: 'org_demo' })
  @IsString()
  orgId?: string;
}
