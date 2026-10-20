import { Inject, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PaymentDirection, PaymentMethod, PaymentModality, PaymentProviderName, PaymentRecordStatus } from 'src/shared/domain/enums';
import { FinanceService } from '../application/finance/finance.service';
import { PaymentChargeService } from '../application/finance/payment-charge.service';
import { SearchPaymentsDto } from '../contracts/dto/search-payments.dto';

class PaymentAllocationBody {
  @IsOptional()
  @IsUUID()
  serviceOrderItemId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  allocatedAmount!: number;
}

class CreatePaymentBody {
  @IsUUID()
  serviceOrderId!: string;

  @IsOptional()
  @IsString()
  paymentReferenceNo?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentModality)
  informedModality?: PaymentModality;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manualReason?: string;

  @IsOptional()
  @IsEnum(PaymentProviderName)
  paymentProvider?: PaymentProviderName;

  @IsOptional()
  @IsEnum(PaymentDirection)
  paymentDirection?: PaymentDirection;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paymentAmount!: number;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsDateString()
  authorizedAt?: string;

  @IsOptional()
  @IsDateString()
  reconciledAt?: string;

  @IsOptional()
  @IsEnum(PaymentRecordStatus)
  status?: PaymentRecordStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationBody)
  allocations?: PaymentAllocationBody[];
}

class AddAllocationsBody {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationBody)
  allocations!: PaymentAllocationBody[];
}

class ChargePaymentBody {
  @IsUUID()
  serviceOrderId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentModality)
  modality!: PaymentModality;

  @IsOptional()
  @IsUUID()
  terminalId?: string;
}

class ReversePaymentBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(FinanceService)
    private readonly financeService: FinanceService,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(PaymentChargeService)
    private readonly paymentChargeService: PaymentChargeService,
  ) {}

  @Permissions('finance.read')
  @Get()
  async list(@Query() query: SearchPaymentsDto, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    if (query.branchId && !principal.effectiveBranchIds.includes(query.branchId)) throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    if (query.serviceOrderId) {
      const serviceOrder = await this.serviceOrderService.getById(query.serviceOrderId, tenantId);
      this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    }
    return this.financeService.searchPayments(tenantId, { ...query, accessibleBranchIds: principal.effectiveBranchIds });
  }

  @Permissions('finance.write')
  @Post()
  async create(@Body() body: CreatePaymentBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const serviceOrder = await this.serviceOrderService.getById(body.serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.financeService.createPayment({
      tenantId,
      actorUserId: principal.userId,
      serviceOrderId: body.serviceOrderId,
      paymentReferenceNo: body.paymentReferenceNo,
      paymentMethod: body.paymentMethod,
      informedModality: body.informedModality,
      manualReason: body.manualReason,
      paymentProvider: body.paymentProvider,
      paymentDirection: body.paymentDirection,
      paymentAmount: body.paymentAmount,
      receivedAt: body.receivedAt,
      authorizedAt: body.authorizedAt,
      reconciledAt: body.reconciledAt,
      status: body.status,
      allocations: body.allocations,
    });
  }

  @Permissions('finance.write')
  @Post('charge')
  async charge(@Body() body: ChargePaymentBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const serviceOrder = await this.serviceOrderService.getById(body.serviceOrderId, tenantId);
    this.serviceOrderService.assertBranchAccess(serviceOrder, principal.effectiveBranchIds);
    return this.paymentChargeService.initiateCharge({
      tenantId,
      actorUserId: principal.userId,
      serviceOrderId: body.serviceOrderId,
      amount: body.amount,
      informedModality: body.modality,
      terminalId: body.terminalId,
    });
  }

  @Permissions('finance.read')
  @Get(':paymentId')
  async getById(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return details;
  }

  @Permissions('finance.write')
  @Post(':paymentId/refresh-status')
  async refreshChargeStatus(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return this.paymentChargeService.refreshCharge(tenantId, paymentId, principal.userId);
  }

  @Permissions('finance.refund')
  @Post(':paymentId/reverse')
  async reverse(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @Body() body: ReversePaymentBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return this.financeService.reversePayment(paymentId, tenantId, principal.userId, body.reason);
  }

  @Permissions('finance.write')
  @Post(':paymentId/cancel')
  async cancelCharge(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return this.paymentChargeService.cancelCharge(tenantId, paymentId, principal.userId);
  }

  @Permissions('finance.write')
  @Post(':paymentId/simulate-sandbox')
  async simulateSandbox(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return this.paymentChargeService.simulateCharge(tenantId, paymentId, principal.userId);
  }

  @Permissions('finance.write')
  @Post(':paymentId/allocations')
  async addAllocations(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @Body() body: AddAllocationsBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    const details = await this.financeService.getPaymentDetails(tenantId, paymentId);
    this.serviceOrderService.assertBranchAccess(details.serviceOrder, principal.effectiveBranchIds);
    return this.financeService.addAllocations(paymentId, tenantId, { actorUserId: principal.userId, allocations: body.allocations });
  }
}
