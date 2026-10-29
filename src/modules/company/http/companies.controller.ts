import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { normalizeRequestValue, PlatformRequest } from 'src/platform/http/request-context';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { CompanyStatus } from 'src/shared/domain/enums';
import { CompanyService } from '../application/company/company.service';

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireTenantId(tenantId: string | null, request: PlatformRequest): string {
  const resolved =
    normalizeRequestValue(tenantId) ?? normalizeRequestValue(request.requestContext.authenticatedPrincipal?.tenantId);
  if (!resolved) {
    throw new BadRequestException('O contexto da Conta é obrigatório para o cadastro de empresas.');
  }
  return resolved;
}

class CompanyFiscalBody {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => hasText(value))
  @IsString()
  @Length(14, 18)
  cnpj?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  municipalRegistration?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => hasText(value))
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => hasText(value))
  @IsString()
  @MaxLength(2)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  logoMimeType?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300_000)
  logoBase64?: string | null;
}

class CreateCompanyBody extends CompanyFiscalBody {
  @IsString()
  @MaxLength(200)
  legalName!: string;
}

class UpdateCompanyBody extends CompanyFiscalBody {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}

@Controller('companies')
export class CompaniesController {
  constructor(
    @Inject(CompanyService)
    private readonly companyService: CompanyService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  @Permissions('companies.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    return this.companyService.listByTenant(requireTenantId(tenantId, request));
  }

  @Permissions('companies.write')
  @Post()
  async create(
    @Body() body: CreateCompanyBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    const company = await this.companyService.create({
      ...body,
      tenantId: requireTenantId(tenantId, request),
      actorUserId,
    });
    await this.branchService.ensureDefaultBranchForCompany({
      tenantId: company.tenantId,
      companyId: company.id,
      legalName: company.legalName,
      actorUserId,
    });
    return company;
  }

  @Permissions('companies.read')
  @Get(':companyId')
  async getById(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    return this.companyService.getById(companyId, requireTenantId(tenantId, request));
  }

  @Permissions('companies.write')
  @Patch(':companyId')
  async update(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: UpdateCompanyBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    return this.companyService.update(companyId, requireTenantId(tenantId, request), { ...body, actorUserId });
  }

  @Permissions('companies.write')
  @Get(':companyId/dependency-check')
  async dependencyCheck(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('action') action: string | undefined,
  ) {
    const resolvedTenantId = requireTenantId(tenantId, request);
    if (action && action !== 'inactivate' && action !== 'delete') {
      throw new BadRequestException(`Unsupported dependency validation action '${action}'.`);
    }
    await this.companyService.getById(companyId, resolvedTenantId);
    return action === 'delete'
      ? this.dependencyValidationService.validateCompanyDeletion(resolvedTenantId, companyId)
      : this.dependencyValidationService.validateCompanyInactivation(resolvedTenantId, companyId);
  }

  @Permissions('companies.write')
  @Delete(':companyId')
  async remove(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    const resolvedTenantId = requireTenantId(tenantId, request);
    await this.companyService.remove(companyId, resolvedTenantId, actorUserId);
    await this.branchService.archiveByCompany(resolvedTenantId, companyId, actorUserId);
    return { id: companyId, deleted: true };
  }
}
