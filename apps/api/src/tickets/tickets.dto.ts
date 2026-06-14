import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@agentic-support/db';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OrgQueryDto {
  @ApiPropertyOptional({ default: 'org_demo' })
  @IsOptional()
  @IsString()
  orgId?: string;
}

export class CreateTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEmail()
  customerEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ default: 'org_demo' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ enum: TicketPriority, enumName: 'TicketPriority' })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty({ enum: TicketStatus, enumName: 'TicketStatus' })
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}

export class UpdateTicketPriorityDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty({ enum: TicketPriority, enumName: 'TicketPriority' })
  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}
