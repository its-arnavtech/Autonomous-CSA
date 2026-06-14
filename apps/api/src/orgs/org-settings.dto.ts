import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoRespond?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireHumanApproval?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  maxAgentCostCents?: number;
}
