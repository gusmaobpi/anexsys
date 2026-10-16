import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { PaymentDirection, PaymentMethod, PaymentRecordStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import {
  PaymentProviderErrorDetails,
  PaymentProviderRequestError,
} from '../../contracts/provider/payment-provider-request-error';
import { PaymentProviderConfigService } from './payment-provider-config.service';
import { PaymentProviderRegistry } from './payment-provider-registry';
import { PaymentTerminalsService } from './payment-terminals.service';
import { PaymentRecordEntity } from '../../infrastructure/persistence/entities/payment-record.entity';
import { PaymentRecordRepository } from '../../infrastructure/persistence/repositories/payment-record.repository';

export type PaymentChargeResult = {
  payment: PaymentRecordEntity;
  terminalId: string;
  terminalName: string;
  provider: string;
  environment: string;
};

@Injectable()
export class PaymentChargeService {
  constructor(
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(PaymentProviderConfigService)
    private readonly configService: PaymentProviderConfigService,
    @Inject(PaymentTerminalsService)
    private readonly terminalsService: PaymentTerminalsService,
    @Inject(PaymentProviderRegistry)
    private readonly providerRegistry: PaymentProviderRegistry,
    @Inject(PaymentRecordRepository)
    private readonly paymentRecordRepository: PaymentRecordRepository,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async initiateCharge(input: {
    tenantId: string;
    serviceOrderId: string;
    amount: number;
    terminalId?: string;
    actorUserId: string;
  }): Promise<PaymentChargeResult> {
    const serviceOrder = await this.serviceOrderService.getById(input.serviceOrderId, input.tenantId);
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new DomainValidationError('Informe o valor da cobrança.');
    }
    const terminal = await this.terminalsService.resolveForCharge(input.tenantId, serviceOrder.branchId, input.terminalId);
    const branch = await this.branchService.getById(serviceOrder.branchId);
    const config = await this.configService.getActiveConfig(input.tenantId, branch.companyId, terminal.provider);
    if (!config) {
      throw new DomainValidationError('Configure a operadora deste terminal em Configurações → Pagamentos.');
    }

    const payment = this.paymentRecordRepository.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      branchId: serviceOrder.branchId,
      serviceOrderId: serviceOrder.id,
      paymentReferenceNo: `ch_${randomUUID()}`,
      paymentMethod: PaymentMethod.CARD,
      paymentProvider: terminal.provider,
      paymentDirection: PaymentDirection.INBOUND,
      paymentAmount: input.amount.toFixed(2),
      receivedAt: null,
      authorizedAt: null,
      reconciledAt: null,
      status: PaymentRecordStatus.PENDING,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });

    const adapter = this.providerRegistry.getAdapter(terminal.provider);
    if (!adapter) {
      payment.status = PaymentRecordStatus.FAILED;
      await this.paymentRecordRepository.save(payment);
      await this.recordChargeAudit(input.tenantId, payment, input.actorUserId, 'finance.charge.failed', 'adapter_missing');
      throw new DomainValidationError('A operadora deste terminal ainda não está integrada ao ANEXSYS.');
    }

    await this.paymentRecordRepository.save(payment);
    try {
      const result = await adapter.initiatePayment({
        provider: terminal.provider,
        referenceNo: payment.paymentReferenceNo as string,
        paymentMethod: PaymentMethod.CARD,
        amount: input.amount,
        serviceOrderId: serviceOrder.id,
        credentials: config.credentials ?? {},
        environment: config.environment,
        terminalCode: terminal.terminalCode,
        description: `OS ${serviceOrder.orderNo}`,
      });
      payment.status = result.authorized
        ? PaymentRecordStatus.AUTHORIZED
        : result.awaitingTerminal
          ? PaymentRecordStatus.PENDING
          : PaymentRecordStatus.FAILED;
      payment.authorizedAt = result.authorizedAt ? new Date(result.authorizedAt) : null;
      this.applyProviderTransactionFields(payment, result);
      payment.updatedBy = input.actorUserId;
      const saved = await this.paymentRecordRepository.save(payment);
      await this.recordChargeAudit(
        input.tenantId,
        saved,
        input.actorUserId,
        result.authorized ? 'finance.charge.initiated' : 'finance.charge.failed',
        result.failureReason ?? null,
      );
      return {
        payment: saved,
        terminalId: terminal.id,
        terminalName: terminal.name,
        provider: terminal.provider,
        environment: config.environment,
      };
    } catch (error) {
      payment.status = PaymentRecordStatus.FAILED;
      payment.updatedBy = input.actorUserId;
      await this.paymentRecordRepository.save(payment);
      if (error instanceof PaymentProviderRequestError) {
        await this.recordChargeAudit(
          input.tenantId,
          payment,
          input.actorUserId,
          'finance.charge.failed',
          error.details.failureType,
          error.details,
        );
        throw new DomainValidationError(
          config.environment === 'sandbox' ? error.toUserMessage() : 'A cobrança não pôde ser iniciada na operadora.',
        );
      }
      await this.recordChargeAudit(input.tenantId, payment, input.actorUserId, 'finance.charge.failed', 'unexpected', {
        failureType: 'unexpected',
        exceptionMessage: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof DomainValidationError) {
        throw error;
      }
      throw new DomainValidationError('A cobrança não pôde ser iniciada na operadora.');
    }
  }

  private applyProviderTransactionFields(
    payment: PaymentRecordEntity,
    fields: {
      cardBrand?: string | null;
      installments?: number | null;
      nsu?: string | null;
      authorizationCode?: string | null;
      acquirerTransactionId?: string | null;
    },
  ): void {
    if (fields.cardBrand) payment.cardBrand = fields.cardBrand;
    if (fields.installments) payment.installments = fields.installments;
    if (fields.nsu) payment.nsu = fields.nsu;
    if (fields.authorizationCode) payment.authorizationCode = fields.authorizationCode;
    if (fields.acquirerTransactionId) payment.acquirerTransactionId = fields.acquirerTransactionId;
  }

  async refreshCharge(tenantId: string, paymentId: string, actorUserId: string): Promise<PaymentChargeResult> {
    const payment = await this.paymentRecordRepository.findById(paymentId);
    if (!payment || payment.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Payment Record '${paymentId}' was not found.`);
    }
    if (!payment.paymentProvider || !payment.paymentReferenceNo) {
      throw new DomainValidationError('Este pagamento não veio da maquininha.');
    }
    const adapter = this.providerRegistry.getAdapter(payment.paymentProvider);
    if (!adapter) {
      throw new DomainValidationError('A operadora deste pagamento ainda não está integrada ao ANEXSYS.');
    }
    const branch = await this.branchService.getById(payment.branchId);
    const config = await this.configService.getActiveConfig(tenantId, branch.companyId, payment.paymentProvider);
    if (!config) {
      throw new DomainValidationError('Configure a operadora deste pagamento em Configurações → Pagamentos.');
    }
    let result;
    try {
      result = await adapter.reconcileSettlement(payment.acquirerTransactionId ?? payment.paymentReferenceNo, {
        credentials: config.credentials ?? {},
        environment: config.environment,
      });
    } catch (error) {
      if (error instanceof PaymentProviderRequestError) {
        await this.recordChargeAudit(
          tenantId,
          payment,
          actorUserId,
          'finance.charge.refresh_failed',
          error.details.failureType,
          error.details,
        );
        throw new DomainValidationError(
          config.environment === 'sandbox' ? error.toUserMessage() : 'Não foi possível consultar a operadora.',
        );
      }
      throw new DomainValidationError('Não foi possível consultar a operadora.');
    }
    if (result.settled) {
      payment.status = PaymentRecordStatus.SETTLED;
      payment.reconciledAt = result.settledAt ? new Date(result.settledAt) : new Date();
      payment.receivedAt = payment.receivedAt ?? new Date();
    } else if (result.canceled) {
      payment.status = PaymentRecordStatus.CANCELED;
    }
    this.applyProviderTransactionFields(payment, result);
    payment.updatedBy = actorUserId;
    const saved = await this.paymentRecordRepository.save(payment);
    await this.recordChargeAudit(tenantId, saved, actorUserId, 'finance.charge.status_refreshed', null);
    return {
      payment: saved,
      terminalId: '',
      terminalName: '',
      provider: saved.paymentProvider as string,
      environment: config.environment,
    };
  }

  /** Simulação oficial do Sandbox: adiciona uma transação CONFIRMED na ordem e já consulta o resultado. */
  async simulateCharge(tenantId: string, paymentId: string, actorUserId: string): Promise<PaymentChargeResult> {
    const payment = await this.paymentRecordRepository.findById(paymentId);
    if (!payment || payment.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Payment Record '${paymentId}' was not found.`);
    }
    if (!payment.paymentProvider || !payment.paymentReferenceNo) {
      throw new DomainValidationError('Este pagamento não veio da maquininha.');
    }
    const adapter = this.providerRegistry.getAdapter(payment.paymentProvider);
    const simulate = (
      adapter as unknown as {
        simulateSandboxPayment?: (
          orderId: string,
          options: { credentials?: Record<string, string>; environment?: string; amount?: number },
        ) => Promise<unknown>;
      } | null
    )?.simulateSandboxPayment;
    if (!adapter || typeof simulate !== 'function') {
      throw new DomainValidationError('A simulação de sandbox não existe para esta operadora.');
    }
    const branch = await this.branchService.getById(payment.branchId);
    const config = await this.configService.getActiveConfig(tenantId, branch.companyId, payment.paymentProvider);
    if (!config) {
      throw new DomainValidationError('Configure a operadora deste pagamento em Configurações → Pagamentos.');
    }
    if (config.environment !== 'sandbox') {
      throw new DomainValidationError('A simulação de pagamento só está disponível no ambiente Sandbox.');
    }
    await simulate.call(adapter, payment.acquirerTransactionId ?? payment.paymentReferenceNo, {
      credentials: config.credentials ?? {},
      environment: config.environment,
      amount: Number(payment.paymentAmount),
    });
    await this.recordChargeAudit(tenantId, payment, actorUserId, 'finance.charge.simulated', null);
    return this.refreshCharge(tenantId, paymentId, actorUserId);
  }

  private async recordChargeAudit(
    tenantId: string,
    payment: PaymentRecordEntity,
    actorUserId: string,
    action: string,
    failureReason: string | null,
    failureDetails?: PaymentProviderErrorDetails | null,
  ): Promise<void> {
    await this.auditService.record({
      tenantId,
      branchId: payment.branchId,
      actorUserId,
      entityType: 'payment_record',
      entityId: payment.id,
      action,
      eventType: 'finance.write',
      metadata: {
        serviceOrderId: payment.serviceOrderId,
        paymentAmount: payment.paymentAmount,
        paymentProvider: payment.paymentProvider,
        failureReason,
        ...(failureDetails
          ? {
              failureType: failureDetails.failureType,
              failureUrl: failureDetails.url ?? null,
              failureMethod: failureDetails.method ?? null,
              failureStatus: failureDetails.status ?? null,
              failureResponseBody: failureDetails.responseBody ?? null,
              failureException: failureDetails.exceptionMessage,
            }
          : {}),
      },
    });
  }
}
