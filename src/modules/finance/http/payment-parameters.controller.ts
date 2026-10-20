import { Body, Controller, Get, Inject, Patch, UnauthorizedException } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { PaymentParametersService } from '../application/finance/payment-parameters.service';

class UpdatePaymentParametersBody {
  @IsInt({ message: 'O tempo de espera fica entre 1 e 30 minutos.' })
  @Min(1, { message: 'O tempo de espera fica entre 1 e 30 minutos.' })
  @Max(30, { message: 'O tempo de espera fica entre 1 e 30 minutos.' })
  machineWaitMinutes!: number;
}

@Controller('payment-parameters')
export class PaymentParametersController {
  constructor(
    @Inject(PaymentParametersService)
    private readonly parametersService: PaymentParametersService,
  ) {}

  @Permissions('finance.read')
  @Get()
  get(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    this.requirePrincipal(tenantId, request);
    return this.parametersService.get(tenantId as string);
  }

  @Permissions('finance.write')
  @Patch()
  update(
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
    @Body() body: UpdatePaymentParametersBody,
  ) {
    const principal = this.requirePrincipal(tenantId, request);
    return this.parametersService.update(tenantId as string, principal.userId, body.machineWaitMinutes);
  }

  private requirePrincipal(tenantId: string | null, request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return principal;
  }
}
