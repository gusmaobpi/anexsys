import { Module } from '@nestjs/common';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './http/dashboard.controller';

@Module({
  imports: [TenantModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
