import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  code?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  warrantyAdjustmentPeriodDays?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  warrantyExecutionPeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  blockDeliveryWithOutstandingBalance?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  delayAlertLeadHours?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grade1Minutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grade2Minutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grade3Minutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  grade4Minutes?: number;

  @IsUUID()
  actorUserId!: string;
}
