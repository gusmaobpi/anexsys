import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { GovernanceModule } from 'src/modules/governance/governance.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { CustomerService } from './application/customer/customer.service';
import { MeasurementCatalogService } from './application/measurement-catalog/measurement-catalog.service';
import { MeasurementService } from './application/measurement/measurement.service';
import {
  MeasurementBodyPartsController,
  MeasurementCatalogController,
  MeasurementUnitsController,
} from './http/measurement-catalog.controller';
import { CustomersController } from './http/customers.controller';
import { CustomerEntity } from './infrastructure/persistence/entities/customer.entity';
import { CustomerContactEntity } from './infrastructure/persistence/entities/customer-contact.entity';
import { CustomerInteractionEntity } from './infrastructure/persistence/entities/customer-interaction.entity';
import { MeasurementBodyPartEntity } from './infrastructure/persistence/entities/measurement-body-part.entity';
import { MeasurementRecordEntity } from './infrastructure/persistence/entities/measurement-record.entity';
import { MeasurementSetEntity } from './infrastructure/persistence/entities/measurement-set.entity';
import { MeasurementSetItemEntity } from './infrastructure/persistence/entities/measurement-set-item.entity';
import { MeasurementUnitEntity } from './infrastructure/persistence/entities/measurement-unit.entity';
import { CustomerContactRepository } from './infrastructure/persistence/repositories/customer-contact.repository';
import { CustomerInteractionRepository } from './infrastructure/persistence/repositories/customer-interaction.repository';
import { CustomerRepository } from './infrastructure/persistence/repositories/customer.repository';
import { MeasurementBodyPartRepository } from './infrastructure/persistence/repositories/measurement-body-part.repository';
import { MeasurementRecordRepository } from './infrastructure/persistence/repositories/measurement-record.repository';
import { MeasurementSetItemRepository } from './infrastructure/persistence/repositories/measurement-set-item.repository';
import { MeasurementSetRepository } from './infrastructure/persistence/repositories/measurement-set.repository';
import { MeasurementUnitRepository } from './infrastructure/persistence/repositories/measurement-unit.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerEntity,
      CustomerContactEntity,
      CustomerInteractionEntity,
      MeasurementRecordEntity,
      MeasurementBodyPartEntity,
      MeasurementUnitEntity,
      MeasurementSetEntity,
      MeasurementSetItemEntity,
    ]),
    AuditModule,
    TenantModule,
    GovernanceModule,
  ],
  controllers: [CustomersController, MeasurementCatalogController, MeasurementBodyPartsController, MeasurementUnitsController],
  providers: [
    CustomerService,
    MeasurementCatalogService,
    MeasurementService,
    CustomerRepository,
    CustomerContactRepository,
    CustomerInteractionRepository,
    MeasurementBodyPartRepository,
    MeasurementRecordRepository,
    MeasurementSetRepository,
    MeasurementSetItemRepository,
    MeasurementUnitRepository,
  ],
  exports: [CustomerService, MeasurementCatalogService, MeasurementService],
})
export class CrmModule {}
