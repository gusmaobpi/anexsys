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
import { IsEnum, IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { PaymentProviderEnvironment } from '../infrastructure/persistence/entities/payment-provider-config.entity';
import { PaymentProviderConfigService } from '../application/finance/payment-provider-config.service';

class CreatePaymentProviderConfigBody {
  @IsUUID()
  companyId!: string;

  @IsEnum(PaymentProviderName)
  provider!: PaymentProviderName;

  @IsEnum(PaymentProviderEnvironment)
  environment!: PaymentProviderEnvironment;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;
}

class PatchPaymentProviderConfigBody {
  @IsOptional()
  @IsEnum(PaymentProviderEnvironment)
  environment?: PaymentProviderEnvironment;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

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

@Controller('payment-provider-configs')
export class PaymentProviderConfigsController {
  constructor(
    @Inject(PaymentProviderConfigService)
    private readonly configService: PaymentProviderConfigService,
  ) {}

  @Permissions('finance.read')
  @Get()
  async list(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Query('companyId') companyId?: string,
  ) {
    requirePrincipal(tenantId, request);
    if (!companyId) {
      throw new BadRequestException('Informe a empresa para listar as configuracoes de pagamento.');
    }
    return this.configService.listConfigs(tenantId as string, companyId);
  }

  @Permissions('finance.write')
  @Post()
  async create(
    @Body() body: CreatePaymentProviderConfigBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.configService.createConfig({
      tenantId: tenantId as string,
      companyId: body.companyId,
      provider: body.provider,
      environment: body.environment,
      credentials: body.credentials,
      actorUserId: principal.userId,
    });
  }

  @Permissions('finance.write')
  @Patch(':configId')
  async update(
    @Param('configId', new ParseUUIDPipe()) configId: string,
    @Body() body: PatchPaymentProviderConfigBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = requirePrincipal(tenantId, request);
    return this.configService.updateConfig(configId, {
      tenantId: tenantId as string,
      environment: body.environment,
      credentials: body.credentials,
      status: body.status,
      actorUserId: principal.userId,
    });
  }
}
