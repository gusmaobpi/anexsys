import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { PaymentTerminalsService } from '../application/finance/payment-terminals.service';

class CreatePaymentTerminalBody {
  @IsUUID()
  branchId!: string;

  @IsEnum(PaymentProviderName)
  provider!: PaymentProviderName;

  @IsString()
  name!: string;

  @IsString()
  terminalCode!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class PatchPaymentTerminalBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  terminalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

function requirePrincipal(tenantId: string | null, request: PlatformRequest) {
  const principal = request.requestContext.authenticatedPrincipal;
  if (!tenantId || !principal) {
    throw new UnauthorizedException('Authenticated tenant context is required.');
  }
  return principal;
}

@Controller('payment-terminals')
export class PaymentTerminalsController {
  constructor(
    @Inject(PaymentTerminalsService)
    private readonly terminalsService: PaymentTerminalsService,
  ) {}

  @Permissions('finance.read')
  @Get()
  async list(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('branchId') branchId?: string,
    @Query('status') status?: 'active' | 'inactive',
  ) {
    requirePrincipal(tenantId, request);
    if (!branchId) {
      throw new BadRequestException('Informe a filial para listar os terminais.');
    }
    return this.terminalsService.listTerminals(tenantId as string, branchId, status);
  }

  @Permissions('finance.write')
  @Post()
  async create(
    @Body() body: CreatePaymentTerminalBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.terminalsService.createTerminal({
      tenantId: tenantId as string,
      branchId: body.branchId,
      provider: body.provider,
      name: body.name,
      terminalCode: body.terminalCode,
      isDefault: body.isDefault,
      actorUserId: principal.userId,
    });
  }

  @Permissions('finance.write')
  @Patch(':terminalId')
  async update(
    @Param('terminalId', new ParseUUIDPipe()) terminalId: string,
    @Body() body: PatchPaymentTerminalBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.terminalsService.updateTerminal(terminalId, {
      tenantId: tenantId as string,
      name: body.name,
      terminalCode: body.terminalCode,
      isDefault: body.isDefault,
      status: body.status,
      actorUserId: principal.userId,
    });
  }
}
