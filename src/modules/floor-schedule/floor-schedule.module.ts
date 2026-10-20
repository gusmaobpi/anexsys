import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { IdentityModule } from 'src/modules/identity/identity.module';
import { ProductionOrdersModule } from 'src/modules/production-orders/production-orders.module';
import { QualityModule } from 'src/modules/quality/quality.module';
import { ServiceOrdersModule } from 'src/modules/service-orders/service-orders.module';
import { FloorScheduleService } from './application/floor-schedule.service';
import { FloorScheduleController } from './http/floor-schedule.controller';
import { PublicFloorController } from './http/public-floor.controller';

@Module({
  imports: [AuditModule, IdentityModule, ServiceOrdersModule, ProductionOrdersModule, QualityModule],
  controllers: [FloorScheduleController, PublicFloorController],
  providers: [FloorScheduleService],
})
export class FloorScheduleModule {}
