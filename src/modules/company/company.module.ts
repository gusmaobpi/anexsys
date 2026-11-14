import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { AuthorizationModule } from 'src/modules/authorization/authorization.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { GovernanceModule } from 'src/modules/governance/governance.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { BranchHoursSeedService } from './application/company/branch-hours-seed.service';
import { BranchHoursService } from './application/company/branch-hours.service';
import { CompanyService } from './application/company/company.service';
import { IsolationReportService } from './application/company/isolation-report.service';
import { PublicOnboardingService } from './application/company/public-onboarding.service';
import { TenantProvisioningService } from './application/company/tenant-provisioning.service';
import { CompaniesController } from './http/companies.controller';
import { IsolationReportController } from './http/isolation-report.controller';
import { PublicOnboardingController } from './http/public-onboarding.controller';
import { TenantModulesController } from './http/tenant-modules.controller';
import { BranchOperatingHoursEntity } from './infrastructure/persistence/entities/branch-operating-hours.entity';
import { CompanyEntity } from './infrastructure/persistence/entities/company.entity';
import { TenantModuleEntity } from './infrastructure/persistence/entities/tenant-module.entity';
import { BranchOperatingHoursRepository } from './infrastructure/persistence/repositories/branch-operating-hours.repository';
import { CompanyRepository } from './infrastructure/persistence/repositories/company.repository';
import { TenantModuleRepository } from './infrastructure/persistence/repositories/tenant-module.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyEntity, BranchOperatingHoursEntity, TenantModuleEntity]),
    AuditModule,
    GovernanceModule,
    forwardRef(() => TenantModule),
    forwardRef(() => BranchModule),
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [CompaniesController, IsolationReportController, TenantModulesController, PublicOnboardingController],
  providers: [
    CompanyService,
    BranchHoursSeedService,
    BranchHoursService,
    TenantProvisioningService,
    PublicOnboardingService,
    IsolationReportService,
    CompanyRepository,
    BranchOperatingHoursRepository,
    TenantModuleRepository,
  ],
  exports: [
    CompanyService,
    BranchHoursSeedService,
    BranchHoursService,
    TenantProvisioningService,
    IsolationReportService,
    CompanyRepository,
    BranchOperatingHoursRepository,
    TenantModuleRepository,
  ],
})
export class CompanyModule {}
