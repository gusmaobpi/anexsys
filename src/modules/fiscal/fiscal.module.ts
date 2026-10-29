import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { ServiceOrdersModule } from 'src/modules/service-orders/service-orders.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { FiscalDeskService } from './application/fiscal/fiscal-desk.service';
import { FiscalService } from './application/fiscal/fiscal.service';
import { FiscalDeskController } from './http/fiscal-desk.controller';
import { FiscalDocumentsController } from './http/fiscal-documents.controller';
import { FiscalDocumentEntity } from './infrastructure/persistence/entities/fiscal-document.entity';
import { FiscalDocumentRepository } from './infrastructure/persistence/repositories/fiscal-document.repository';

@Module({
  imports: [TypeOrmModule.forFeature([FiscalDocumentEntity]), AuditModule, TenantModule, BranchModule, ServiceOrdersModule],
  controllers: [FiscalDocumentsController, FiscalDeskController],
  providers: [FiscalService, FiscalDeskService, FiscalDocumentRepository],
  exports: [FiscalService, FiscalDeskService],
})
export class FiscalModule {}
