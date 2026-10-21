import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CustomerType } from 'src/shared/domain/enums';

export class CreateCustomerRequestDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsString()
  fullName!: string;

  @IsString()
  mobilePhone!: string;

  @IsOptional()
  @IsString()
  @Length(11, 14)
  cpf?: string;

  @IsOptional()
  @IsString()
  @Length(8, 20)
  postalCode?: string;

  @IsString()
  street!: string;

  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  district!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  country!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;
}

export class CreateCustomerDto extends CreateCustomerRequestDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  actorUserId!: string;
}
