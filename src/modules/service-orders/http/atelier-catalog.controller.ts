import {
  Inject,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { DependencyValidationService } from 'src/modules/governance/application/dependency-validation.service';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { MeasurementCatalogStatus } from 'src/shared/domain/enums';
import { AtelierCatalogService } from '../application/atelier-catalog/atelier-catalog.service';

class CreateCatalogNameBody {
  @IsString()
  displayName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

class PatchCatalogNameBody {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MeasurementCatalogStatus)
  status?: MeasurementCatalogStatus;
}

class CreateProductServiceBody {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  suggestedPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes!: number;
}

class PatchProductServiceBody {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  suggestedPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsEnum(MeasurementCatalogStatus)
  status?: MeasurementCatalogStatus;
}

class CreateMinuteRateBody {
  @IsUUID()
  companyId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valuePerMinute!: number;
}

class PatchMinuteRateBody {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valuePerMinute?: number;

  @IsOptional()
  @IsEnum(MeasurementCatalogStatus)
  status?: MeasurementCatalogStatus;
}

function requirePrincipal(tenantId: string | null, request: PlatformRequest) {
  const principal = request.requestContext.authenticatedPrincipal;
  if (!tenantId || !principal) {
    throw new UnauthorizedException('Authenticated tenant context is required.');
  }
  return principal;
}

function requireDependencyAction(action: string | undefined) {
  if (action && action !== 'inactivate' && action !== 'delete') {
    throw new BadRequestException(`Unsupported dependency validation action '${action}'.`);
  }
  return action === 'delete' ? 'delete' : 'inactivate';
}

@Controller('garment-products')
export class GarmentProductsController {
  constructor(
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  @Permissions('service_orders.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.listProducts(tenantId as string, principal.userId);
  }

  @Permissions('service_orders.write')
  @Get(':productId/dependency-check')
  async dependencyCheck(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('action') action: string | undefined,
  ) {
    requirePrincipal(tenantId, request);
    return requireDependencyAction(action) === 'delete'
      ? this.dependencyValidationService.validateGarmentProductDeletion(tenantId as string, productId)
      : this.dependencyValidationService.validateGarmentProductInactivation(tenantId as string, productId);
  }

  @Permissions('service_orders.write')
  @Post()
  async create(
    @Body() body: CreateCatalogNameBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    if (!body.displayName.trim()) {
      throw new BadRequestException('O nome do produto é obrigatório.');
    }
    return this.atelierCatalogService.createProduct({
      tenantId: tenantId as string,
      displayName: body.displayName,
      sortOrder: body.sortOrder,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Patch(':productId')
  async update(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() body: PatchCatalogNameBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.updateProduct(productId, {
      tenantId: tenantId as string,
      displayName: body.displayName,
      sortOrder: body.sortOrder,
      status: body.status,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Delete(':productId')
  async remove(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    await this.atelierCatalogService.removeProduct(productId, tenantId as string, principal.userId);
    return { id: productId, deleted: true };
  }
}

@Controller('atelier-services')
export class AtelierServicesController {
  constructor(
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
    @Inject(DependencyValidationService)
    private readonly dependencyValidationService: DependencyValidationService,
  ) {}

  @Permissions('service_orders.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.listServices(tenantId as string, principal.userId);
  }

  @Permissions('service_orders.write')
  @Get(':serviceId/dependency-check')
  async dependencyCheck(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('action') action: string | undefined,
  ) {
    requirePrincipal(tenantId, request);
    return requireDependencyAction(action) === 'delete'
      ? this.dependencyValidationService.validateAtelierServiceDeletion(tenantId as string, serviceId)
      : this.dependencyValidationService.validateAtelierServiceInactivation(tenantId as string, serviceId);
  }

  @Permissions('service_orders.write')
  @Post()
  async create(
    @Body() body: CreateCatalogNameBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    if (!body.displayName.trim()) {
      throw new BadRequestException('O nome do serviço é obrigatório.');
    }
    return this.atelierCatalogService.createService({
      tenantId: tenantId as string,
      displayName: body.displayName,
      sortOrder: body.sortOrder,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Patch(':serviceId')
  async update(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: PatchCatalogNameBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.updateService(serviceId, {
      tenantId: tenantId as string,
      displayName: body.displayName,
      sortOrder: body.sortOrder,
      status: body.status,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Delete(':serviceId')
  async remove(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    await this.atelierCatalogService.removeService(serviceId, tenantId as string, principal.userId);
    return { id: serviceId, deleted: true };
  }
}

@Controller('product-services')
export class ProductServicesController {
  constructor(
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
  ) {}

  @Permissions('service_orders.read')
  @Get()
  async list(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('productId') productId?: string,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.listProductServices(tenantId as string, principal.userId, productId);
  }

  @Permissions('service_orders.write')
  @Post()
  async create(
    @Body() body: CreateProductServiceBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.createProductService({
      tenantId: tenantId as string,
      productId: body.productId,
      serviceId: body.serviceId,
      serviceName: body.serviceName,
      suggestedPrice: body.suggestedPrice,
      estimatedMinutes: body.estimatedMinutes,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Patch(':priceId')
  async update(
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
    @Body() body: PatchProductServiceBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.updateProductService(priceId, {
      tenantId: tenantId as string,
      suggestedPrice: body.suggestedPrice,
      estimatedMinutes: body.estimatedMinutes,
      status: body.status,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Delete(':priceId')
  async remove(
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    await this.atelierCatalogService.removeProductService(priceId, tenantId as string, principal.userId);
    return { id: priceId, deleted: true };
  }
}

@Controller('minute-rates')
export class MinuteRatesController {
  constructor(
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
  ) {}

  @Permissions('service_orders.read')
  @Get()
  async list(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('companyId') companyId?: string,
  ) {
    requirePrincipal(tenantId, request);
    if (!companyId) {
      throw new BadRequestException('Informe a empresa para listar as tabelas de valor por minuto.');
    }
    return this.atelierCatalogService.listMinuteRates(tenantId as string, companyId);
  }

  @Permissions('service_orders.write')
  @Post()
  async create(
    @Body() body: CreateMinuteRateBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.createMinuteRate({
      tenantId: tenantId as string,
      companyId: body.companyId,
      valuePerMinute: body.valuePerMinute,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Patch(':rateId')
  async update(
    @Param('rateId', new ParseUUIDPipe()) rateId: string,
    @Body() body: PatchMinuteRateBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.atelierCatalogService.updateMinuteRate(rateId, {
      tenantId: tenantId as string,
      valuePerMinute: body.valuePerMinute,
      status: body.status,
      actorUserId: principal.userId,
    });
  }
}
