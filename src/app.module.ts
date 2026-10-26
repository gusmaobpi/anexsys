import { Inject, MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { applyPendingMigrations } from './platform/database/typeorm/apply-pending-migrations';
import { AuthorizationService } from './modules/authorization/application/authorization/authorization.service';
import { TokenFactoryService } from './platform/auth/token-factory.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { AuditModule } from './modules/audit/audit.module';
import { BranchModule } from './modules/branch/branch.module';
import { CompanyModule } from './modules/company/company.module';
import { CrmModule } from './modules/crm/crm.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OperationalResourcesModule } from './modules/operational-resources/operational-resources.module';
import { ProductionOrdersModule } from './modules/production-orders/production-orders.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module';
import { QualityModule } from './modules/quality/quality.module';
import { ReworkModule } from './modules/rework/rework.module';
import { WarrantyModule } from './modules/warranty/warranty.module';
import { FinanceModule } from './modules/finance/finance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FloorScheduleModule } from './modules/floor-schedule/floor-schedule.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { EmailModule } from './modules/email/email.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { CustodyModule } from './modules/custody/custody.module';
import { JwtAuthGuard } from './platform/auth/jwt-auth.guard';
import { PermissionsGuard } from './platform/auth/permissions.guard';
import { HealthController } from './platform/http/health.controller';
import { RequestContextMiddleware } from './platform/http/request-context.middleware';
import { buildTypeOrmOptions } from './platform/database/typeorm/typeorm.config';
import { PickupModule } from './modules/pickup/pickup.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { SmartConciergeModule } from './modules/smart-concierge/smart-concierge.module';
import { TenantRlsInterceptor } from './platform/tenancy/tenant-rls.interceptor';
import { patchPostgresQueryRunnerForRls } from './platform/tenancy/tenant-rls.patch';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: buildTypeOrmOptions,
    }),
    AuditModule,
    TenantModule,
    CompanyModule,
    BranchModule,
    CrmModule,
    ServiceOrdersModule,
    OperationalResourcesModule,
    ProductionOrdersModule,
    QualityModule,
    ReworkModule,
    WarrantyModule,
    FinanceModule,
    FloorScheduleModule,
    DashboardModule,
    WhatsappModule,
    EmailModule,
    IntegrationModule,
    FiscalModule,
    CustodyModule,
    PickupModule,
    CustomerPortalModule,
    SmartConciergeModule,
    IdentityModule,
    AuthorizationModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (
        reflector: Reflector,
        tokenFactoryService: TokenFactoryService,
        authorizationService: AuthorizationService,
      ) => new JwtAuthGuard(reflector, tokenFactoryService, authorizationService),
      inject: [Reflector, TokenFactoryService, AuthorizationService],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantRlsInterceptor,
    },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    patchPostgresQueryRunnerForRls();
    try {
      await applyPendingMigrations(this.dataSource);
    } catch (error) {
      console.warn('Não foi possível atualizar o banco da OS na subida.', error);
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
