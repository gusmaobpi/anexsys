import { Module } from '@nestjs/common';
import { AuthorizationModule } from 'src/modules/authorization/authorization.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { CompanyModule } from 'src/modules/company/company.module';
import { CrmModule } from 'src/modules/crm/crm.module';
import { FinanceModule } from 'src/modules/finance/finance.module';
import { IdentityModule } from 'src/modules/identity/identity.module';
import { ServiceOrdersModule } from 'src/modules/service-orders/service-orders.module';
import { IntegrationImportService } from './application/integration-import.service';
import { IntegrationRunService } from './application/integration-run.service';
import { IntegrationImportController } from './http/integration-import.controller';

@Module({
  imports: [CrmModule, ServiceOrdersModule, CompanyModule, BranchModule, IdentityModule, AuthorizationModule, FinanceModule],
  controllers: [IntegrationImportController],
  providers: [IntegrationImportService, IntegrationRunService],
})
export class IntegrationModule {}
