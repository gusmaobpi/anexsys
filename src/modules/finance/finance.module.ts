import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { BranchModule } from 'src/modules/branch/branch.module';
import { CompanyModule } from 'src/modules/company/company.module';
import { ServiceOrdersModule } from 'src/modules/service-orders/service-orders.module';
import { TenantModule } from 'src/modules/tenant/tenant.module';
import { FinanceService } from './application/finance/finance.service';
import { PaymentChargeService } from './application/finance/payment-charge.service';
import { PaymentProviderConfigService } from './application/finance/payment-provider-config.service';
import { PaymentProviderRegistry } from './application/finance/payment-provider-registry';
import { PaymentTerminalsService } from './application/finance/payment-terminals.service';
import { CashflowController } from './http/cashflow.controller';
import { FinancialExceptionsController } from './http/financial-exceptions.controller';
import { PaymentProviderConfigsController } from './http/payment-provider-configs.controller';
import { PaymentTerminalsController } from './http/payment-terminals.controller';
import { PaymentsController } from './http/payments.controller';
import { ServiceOrderFinanceController } from './http/service-order-finance.controller';
import { FinancialExceptionEntity } from './infrastructure/persistence/entities/financial-exception.entity';
import { PartialPaymentEntity } from './infrastructure/persistence/entities/partial-payment.entity';
import { PaymentProviderConfigEntity } from './infrastructure/persistence/entities/payment-provider-config.entity';
import { PaymentRecordEntity } from './infrastructure/persistence/entities/payment-record.entity';
import { PaymentTerminalEntity } from './infrastructure/persistence/entities/payment-terminal.entity';
import { FinancialExceptionRepository } from './infrastructure/persistence/repositories/financial-exception.repository';
import { PartialPaymentRepository } from './infrastructure/persistence/repositories/partial-payment.repository';
import { PaymentProviderConfigRepository } from './infrastructure/persistence/repositories/payment-provider-config.repository';
import { PaymentRecordRepository } from './infrastructure/persistence/repositories/payment-record.repository';
import { PaymentTerminalRepository } from './infrastructure/persistence/repositories/payment-terminal.repository';
import { CieloOrderManagerAdapter } from './infrastructure/providers/cielo-order-manager.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentRecordEntity, PartialPaymentEntity, FinancialExceptionEntity, PaymentProviderConfigEntity, PaymentTerminalEntity]), AuditModule, TenantModule, BranchModule, CompanyModule, ServiceOrdersModule],
  controllers: [PaymentsController, FinancialExceptionsController, CashflowController, ServiceOrderFinanceController, PaymentProviderConfigsController, PaymentTerminalsController],
  providers: [FinanceService, PaymentChargeService, PaymentProviderConfigService, PaymentProviderRegistry, PaymentTerminalsService, PaymentRecordRepository, PartialPaymentRepository, FinancialExceptionRepository, PaymentProviderConfigRepository, PaymentTerminalRepository, CieloOrderManagerAdapter],
  exports: [FinanceService, PaymentProviderConfigService, PaymentTerminalsService],
})
export class FinanceModule {}
