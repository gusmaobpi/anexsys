import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryType, SurchargeMethod } from 'src/shared/domain/enums';

export class CreateServiceOrderItemInputDto {
  @IsString()
  itemType!: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  brand!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serialNo?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  timeMinutes?: number | null;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsString()
  operationalPriority?: string;
}

export class CreateServiceOrderDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  commercialResponsibleActorId?: string;

  @IsOptional()
  @IsUUID()
  technicalMeasurementResponsibleActorId?: string;

  @IsOptional()
  @IsDateString()
  deliveryCommitmentSourceAt?: string;

  @IsOptional()
  @IsDateString()
  actualPickupDate?: string;

  @IsOptional()
  @IsDateString()
  actualDeliveryDate?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsEnum(DeliveryType)
  deliveryType?: DeliveryType;

  @IsOptional()
  @IsDateString()
  promisedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/)
  promisedDeliveryTime?: string;

  @IsOptional()
  @IsString()
  operationalPriority?: string;

  @IsOptional()
  @IsEnum(SurchargeMethod)
  deliverySurchargeMethod?: SurchargeMethod;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliverySurchargeValue?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsString()
  commercialNotes?: string;

  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  difficultyGrade?: number | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceOrderItemInputDto)
  items!: CreateServiceOrderItemInputDto[];

  @IsUUID()
  actorUserId!: string;
}
