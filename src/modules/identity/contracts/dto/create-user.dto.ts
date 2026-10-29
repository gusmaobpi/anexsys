import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  defaultBranchId?: string;

  @IsEmail()
  email!: string;

  @IsString()
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  portraitMimeType?: string | null;

  @IsOptional()
  @IsString()
  portraitBase64?: string | null;

  @IsUUID()
  actorUserId!: string;
}
