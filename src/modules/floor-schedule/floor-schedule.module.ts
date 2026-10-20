import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { IdentityModule } from 'src/modules/identity/identity.module';
import { ProductionOrdersModule } from 'src/modules/production-orders/production-orders.module';
import { ServiceOrdersModule } from 'src/modules/service-orders/service-orders.module';
import { FloorScheduleService } from './application/floor-schedule.service';
import { FloorScheduleController } from './http/floor-schedule.controller';

@Module({
  imports: [AuditModule, IdentityModule, ServiceOrdersModule, ProductionOrdersModule],
  controllers: [FloorScheduleController],
  providers: [FloorScheduleService],
})
export class FloorScheduleModule {}
