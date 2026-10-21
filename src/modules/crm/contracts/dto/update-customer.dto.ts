import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { CustomerStatus, CustomerType } from 'src/shared/domain/enums';

export class UpdateCustomerRequestDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @IsOptional()
  @IsString()
  @Length(11, 14)
  cpf?: string | null;

  @IsOptional()
  @IsString()
  @Length(8, 20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  street?: string | null;

  @IsOptional()
  @IsString()
  number?: string | null;

  @IsOptional()
  @IsString()
  complement?: string | null;

  @IsOptional()
  @IsString()
  district?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  observations?: string | null;

  @IsOptional()
  @IsString()
  tradeName?: string | null;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;
}

export class UpdateCustomerDto extends UpdateCustomerRequestDto {
  @IsUUID()
  actorUserId!: string;
}
