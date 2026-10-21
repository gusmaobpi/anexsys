import { Controller, Get, Inject, Query, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { PlatformRequest } from 'src/platform/http/request-context';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { DashboardService } from '../application/dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('home')
  async home(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    if (!principal.effectiveBranchIds.includes(branchId)) {
      throw new UnauthorizedException('Filial fora do seu acesso.');
    }
    return this.dashboardService.home(tenantId, branchId);
  }
}
