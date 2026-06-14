import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus } from '@agentic-support/db';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateKnowledgeArticleDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional tags used for deterministic keyword retrieval',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: KnowledgeArticleStatus,
    enumName: 'KnowledgeArticleStatus',
  })
  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;
}

export class ListKnowledgeArticlesQueryDto {
  @ApiPropertyOptional({ default: 'org_demo' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({
    enum: KnowledgeArticleStatus,
    enumName: 'KnowledgeArticleStatus',
  })
  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;
}

export class UpdateKnowledgeArticleDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional tags used for deterministic keyword retrieval',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: KnowledgeArticleStatus,
    enumName: 'KnowledgeArticleStatus',
  })
  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;
}

export class SearchKnowledgeDto {
  @ApiProperty({ default: 'org_demo' })
  @IsString()
  orgId!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
