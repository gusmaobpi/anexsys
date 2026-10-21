import {
  Inject,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { DeliveryType, ServiceOrderItemStatus, SurchargeMethod } from 'src/shared/domain/enums';
import { SearchServiceOrdersDto } from '../contracts/dto/search-service-orders.dto';
import { nextFloorAction } from '../application/service-order/service-order-floor';
import { ServiceOrderService } from '../application/service-order/service-order.service';

function canRunFloorAction(action: string, permissions: string[]) {
  if (action === 'open_review') {
    return permissions.includes('quality.write') || permissions.includes('service_orders.write');
  }
  return permissions.includes('production_orders.write') || permissions.includes('service_orders.write');
}

function canRunProofAction(permissions: string[]) {
  return permissions.includes('production_orders.write') || permissions.includes('service_orders.write');
}

class CreateServiceOrderItemBody {
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

class CreateServiceOrderBody {
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
  @Type(() => CreateServiceOrderItemBody)
  items!: CreateServiceOrderItemBody[];
}

class UpdateServiceOrderBody {
  @IsOptional()
  @IsUUID()
  customerId?: string;

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
}

class DeliveryReleaseBody {
  @IsString()
  @MinLength(1)
  reason!: string;
}

class ClientReturnBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  itemIds!: string[];

  @IsOptional()
  @IsBoolean()
  waiveCharge?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

class CounterReworkBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  itemIds!: string[];

  @IsString()
  @MinLength(1)
  reason!: string;
}

class CompleteProofNoteBody {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

class CompleteProofBody {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteProofNoteBody)
  notes?: CompleteProofNoteBody[];
}

class PickupPhotoBody {
  @IsString()
  mimeType!: string;

  @IsString()
  contentBase64!: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}

class CompletePickupBody {
  @IsIn(['paper', 'attendant'])
  method!: 'paper' | 'attendant';

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PickupPhotoBody)
  photo?: PickupPhotoBody;
}

class CompleteApprovalBody {
  @IsIn(['counter', 'paper', 'release'])
  method!: 'counter' | 'paper' | 'release';

  @IsOptional()
  @IsString()
  releaseReason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PickupPhotoBody)
  photo?: PickupPhotoBody;
}

class UpdateServiceOrderItemBody {
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

  @IsOptional()
  @IsEnum(ServiceOrderItemStatus)
  status?: ServiceOrderItemStatus;
}

@Controller('service-orders')
export class ServiceOrdersController {
  constructor(
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
  ) {}

  @Permissions('service_orders.read')
  @Get()
  async list(
    @Query() query: SearchServiceOrdersDto,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (query.branchId && !principal.effectiveBranchIds.includes(query.branchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    return this.serviceOrderService.search(tenantId, {
      ...query,
      accessibleBranchIds: principal.effectiveBranchIds,
    });
  }

  @Permissions('service_orders.read')
  @Get('delivery-preview')
  async previewDelivery(
    @Query('branchId') branchId: string,
    @Query('deliveryType') deliveryType: DeliveryType | undefined,
    @Query('itemCount') itemCount: string | undefined,
    @Query('sourceAt') sourceAt: string | undefined,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (!branchId) {
      throw new ForbiddenException('Branch context is required.');
    }
    if (!principal.effectiveBranchIds.includes(branchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    return this.serviceOrderService.previewDelivery(tenantId, {
      branchId,
      deliveryType,
      itemCount: itemCount ? Number(itemCount) : 1,
      sourceAt,
    });
  }

  @Permissions('service_orders.read')
  @Get('next-number')
  async nextNumber(@CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return this.serviceOrderService.previewNextOrderNo(tenantId);
  }

  @Permissions('service_orders.read')
  @Get('settings')
  async settings(@CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return this.serviceOrderService.getBagSettings(tenantId);
  }

  @Permissions('service_orders.write')
  @Post()
  async create(
    @Body() body: CreateServiceOrderBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (!principal.effectiveBranchIds.includes(body.branchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    return this.serviceOrderService.create({
      ...body,
      tenantId,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.read')
  @Get(':serviceOrderId/print-view')
  async printView(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.getPrintView(tenantId, serviceOrderId);
  }

  @Permissions('service_orders.read')
  @Get(':serviceOrderId')
  async getById(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.getDetails(tenantId, serviceOrderId);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/next-version')
  async spawnNextVersion(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.spawnNextVersion(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/close-bag')
  async closeBag(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.closeBag(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.read')
  @Post(':serviceOrderId/send-to-proof')
  async sendToProof(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (!canRunProofAction(principal.effectivePermissions)) {
      throw new ForbiddenException('Você não tem permissão para enviar esta OS para prova.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.sendToProof(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.read')
  @Post(':serviceOrderId/complete-proof')
  async completeProof(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: CompleteProofBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (!canRunProofAction(principal.effectivePermissions)) {
      throw new ForbiddenException('Você não tem permissão para concluir a prova desta OS.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.completeProof(tenantId, serviceOrderId, principal.userId, body?.notes);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/pickup/start')
  async startPickup(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.startPickup(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/pickup/complete')
  async completePickup(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: CompletePickupBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.completePickup(tenantId, serviceOrderId, principal.userId, {
      method: body.method,
      recipientName: body.recipientName,
      photo: body.photo,
    });
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/approval')
  async completeApproval(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: CompleteApprovalBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.completeApproval(tenantId, serviceOrderId, principal.userId, {
      method: body.method,
      photo: body.photo,
      releaseReason: body.releaseReason,
      userAgent: userAgent ?? null,
      ip: ip ?? null,
    });
  }

  @Permissions('service_orders.read')
  @Get(':serviceOrderId/approval/photo')
  async getApprovalPhoto(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.getApprovalPhoto(tenantId, serviceOrderId);
  }

  @Permissions('service_orders.read')
  @Get(':serviceOrderId/pickup/photo')
  async getPickupPhoto(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.getPickupPhoto(tenantId, serviceOrderId);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/deliver')
  async markPickedUp(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.markPickedUp(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.release')
  @Post(':serviceOrderId/delivery-release')
  async releaseDelivery(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: DeliveryReleaseBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.releaseDelivery(tenantId, serviceOrderId, principal.userId, body.reason);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/client-return')
  async createClientReturn(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: ClientReturnBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    if (body.waiveCharge === true && !principal.effectivePermissions.includes('service_orders.release')) {
      throw new ForbiddenException('Só o gerente libera a OS sem valor fora do prazo.');
    }
    return this.serviceOrderService.createClientReturn(tenantId, serviceOrderId, principal.userId, body.itemIds, {
      waiveCharge: body.waiveCharge === true,
      reason: body.reason,
    });
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/counter-rework')
  async createCounterRework(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: CounterReworkBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.createCounterRework(
      tenantId,
      serviceOrderId,
      principal.userId,
      body.itemIds,
      body.reason,
    );
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/open-bag')
  async reopenBag(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.reopenBag(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.read')
  @Post(':serviceOrderId/floor-advance')
  async advanceFloor(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    const action = nextFloorAction(serviceOrder.status, serviceOrder.bagClosed);
    if (action && !canRunFloorAction(action, principal.effectivePermissions)) {
      throw new ForbiddenException('Você não tem permissão para este passo de produção.');
    }
    return this.serviceOrderService.advanceFloor(tenantId, serviceOrderId, principal.userId);
  }

  @Permissions('service_orders.write')
  @Patch(':serviceOrderId')
  async update(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: UpdateServiceOrderBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.update(serviceOrderId, tenantId, { ...body, actorUserId: principal.userId });
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/items')
  async createItem(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Body() body: CreateServiceOrderItemBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.addItem({
      ...body,
      tenantId,
      branchId: serviceOrder.branchId,
      serviceOrderId,
      actorUserId: principal.userId,
    });
  }

  @Permissions('service_orders.write')
  @Patch(':serviceOrderId/items/:itemId')
  async updateItem(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() body: UpdateServiceOrderItemBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.updateItem(serviceOrderId, itemId, tenantId, { ...body, actorUserId: principal.userId });
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/approve')
  async approve(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.completeApproval(tenantId, serviceOrderId, principal.userId, {
      method: 'counter',
      userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
    });
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/cancel')
  async cancel(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.cancel(serviceOrderId, tenantId, principal.userId);
  }

  @Permissions('service_orders.write')
  @Post(':serviceOrderId/delivery-date/recalculate')
  async recalculateDeliveryDate(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.recalculateDeliveryDate(serviceOrderId, tenantId, principal.userId);
  }

  @Permissions('service_orders.read')
  @Get(':serviceOrderId/timeline')
  async timeline(
    @Param('serviceOrderId', new ParseUUIDPipe()) serviceOrderId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    const serviceOrder = await this.serviceOrderService.getById(serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.serviceOrderService.getTimeline(serviceOrderId, tenantId);
  }
}
