import {
  Inject,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { TenantProvisioningService } from 'src/modules/company/application/company/tenant-provisioning.service';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { TenantService } from '../application/tenant/tenant.service';

class CreateTenantBody {
  @IsString()
  @Length(2, 50)
  code!: string;

  @IsString()
  legalName!: string;

  @IsString()
  displayName!: string;

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

  @IsOptional()
  @IsString()
  @Length(14, 18)
  cnpj?: string;
}

class UpdateTenantBody {
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
}

@Controller('tenants')
export class TenantsController {
  constructor(
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
    @Inject(TenantProvisioningService)
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  @Permissions('tenants.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const permissions = request.requestContext.authenticatedPrincipal?.effectivePermissions ?? [];
    if (permissions.includes('platform.tenants.create')) {
      return TenantContext.run({ tenantId: null, bypass: true }, () => this.tenantService.list());
    }
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    return [await this.tenantService.getById(tenantId)];
  }

  @Permissions('platform.tenants.create')
  @Post()
  async create(@Body() body: CreateTenantBody, @CurrentRequest() request: PlatformRequest) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const provisioned = await this.tenantProvisioningService.provisionNewAccount({
      code: body.code,
      legalName: body.legalName,
      displayName: body.displayName,
      cnpj: body.cnpj,
      actorUserId,
    });
    return provisioned.tenant;
  }

  @Permissions('tenants.read')
  @Get(':tenantId')
  async getById(@Param('tenantId') tenantId: string, @CurrentTenantId() currentTenantId: string | null) {
    this.assertTenantScope(tenantId, currentTenantId);
    return this.tenantService.getById(tenantId);
  }

  @Permissions('tenants.write')
  @Patch(':tenantId')
  async update(
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateTenantBody,
    @CurrentTenantId() currentTenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    this.assertTenantScope(tenantId, currentTenantId);
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.tenantService.update(tenantId, { ...body, actorUserId });
  }

  @Permissions('tenants.write')
  @Get(':tenantId/dependency-check')
  async dependencyCheck(
    @Param('tenantId') tenantId: string,
    @CurrentTenantId() currentTenantId: string | null,
    @Query('action') action: string | undefined,
  ) {
    this.assertTenantScope(tenantId, currentTenantId);
    if (action && action !== 'deactivate') {
      throw new BadRequestException(`Unsupported dependency validation action '${action}'.`);
    }

    return this.dependencyValidationService.validateTenantDeactivation(tenantId);
  }

  @Permissions('tenants.write')
  @Post(':tenantId/activate')
  async activate(
    @Param('tenantId') tenantId: string,
    @CurrentTenantId() currentTenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    this.assertTenantScope(tenantId, currentTenantId);
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.tenantService.activate(tenantId, actorUserId);
  }

  @Permissions('tenants.write')
  @Post(':tenantId/deactivate')
  async deactivate(
    @Param('tenantId') tenantId: string,
    @CurrentTenantId() currentTenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    this.assertTenantScope(tenantId, currentTenantId);
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.tenantService.deactivate(tenantId, actorUserId);
  }

  private assertTenantScope(requestedTenantId: string, currentTenantId: string | null): void {
    if (!currentTenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (requestedTenantId !== currentTenantId) {
      throw new ForbiddenException('Requested tenant is outside the authenticated tenant scope.');
    }
  }
}
