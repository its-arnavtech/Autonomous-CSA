import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const approvalDecisionValues = ['APPROVED', 'REJECTED'] as const;

export type ApprovalDecision = (typeof approvalDecisionValues)[number];

export class CreateApprovalDto {
  @ApiProperty()
  @IsString()
  ticketId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentRunId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proposedResponse?: string;
}

export class UpdateApprovalDto {
  @ApiProperty({ enum: approvalDecisionValues })
  @IsIn(approvalDecisionValues)
  status!: ApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
