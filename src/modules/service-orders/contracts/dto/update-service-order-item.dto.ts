import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { DeliveryType, ServiceOrderItemStatus } from 'src/shared/domain/enums';

export class UpdateServiceOrderItemDto {
  @IsOptional()
  @IsString()
  itemType?: string;

  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @IsOptional()
  @IsUUID()
  serviceId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  complement?: string | null;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serialNo?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number | null;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  timeMinutes?: number | null;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType | null;

  @IsOptional()
  @IsString()
  operationalPriority?: string | null;

  @IsOptional()
  @IsEnum(ServiceOrderItemStatus)
  status?: ServiceOrderItemStatus;

  @IsUUID()
  actorUserId!: string;
}
