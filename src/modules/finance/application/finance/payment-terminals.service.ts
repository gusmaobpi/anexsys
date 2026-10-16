import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { PaymentProviderName } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { PaymentTerminalEntity } from '../../infrastructure/persistence/entities/payment-terminal.entity';
import { PaymentTerminalRepository } from '../../infrastructure/persistence/repositories/payment-terminal.repository';

export type PaymentTerminalView = {
  id: string;
  branchId: string;
  provider: PaymentProviderName;
  name: string;
  terminalCode: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
};

@Injectable()
export class PaymentTerminalsService {
  constructor(
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(PaymentTerminalRepository)
    private readonly terminalRepository: PaymentTerminalRepository,
  ) {}

  async listTerminals(tenantId: string, branchId: string, status?: 'active' | 'inactive'): Promise<PaymentTerminalView[]> {
    await this.tenantService.getById(tenantId);
    const branch = await this.branchService.getById(branchId);
    if (branch.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Branch '${branchId}' was not found.`);
    }
    const rows = status === 'active'
      ? await this.terminalRepository.findActiveByBranch(tenantId, branch.id)
      : await this.terminalRepository.findListedByBranch(tenantId, branch.id);
    return rows.map((row) => this.toView(row));
  }

  async createTerminal(input: {
    tenantId: string;
    branchId: string;
    provider: PaymentProviderName;
    name: string;
    terminalCode: string;
    isDefault?: boolean;
    actorUserId: string;
  }): Promise<PaymentTerminalView> {
    await this.tenantService.getById(input.tenantId);
    const branch = await this.branchService.getById(input.branchId);
    if (branch.tenantId !== input.tenantId) {
      throw new EntityNotFoundError(`Branch '${input.branchId}' was not found.`);
    }
    const name = this.requireTerminalName(input.name);
    const terminalCode = this.requireTerminalCode(input.terminalCode);

    const listed = await this.terminalRepository.findListedByBranch(input.tenantId, branch.id);
    const shouldBeDefault = input.isDefault === true || !listed.some((terminal) => terminal.isDefault);
    if (shouldBeDefault) {
      await this.unsetDefaults(input.tenantId, branch.id, input.actorUserId);
    }

    const saved = await this.terminalRepository.save(
      this.terminalRepository.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        branchId: branch.id,
        provider: input.provider,
        name,
        terminalCode,
        isDefault: shouldBeDefault,
        status: 'active',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      }),
    );
    await this.auditService.record({
      tenantId: input.tenantId,
      branchId: branch.id,
      actorUserId: input.actorUserId,
      entityType: 'payment_terminal',
      entityId: saved.id,
      action: 'finance.terminal.created',
      eventType: 'finance.write',
      metadata: { branchId: branch.id, provider: saved.provider },
    });
    return this.toView(saved);
  }

  async updateTerminal(
    id: string,
    input: {
      tenantId: string;
      name?: string;
      terminalCode?: string;
      isDefault?: boolean;
      status?: 'active' | 'inactive';
      actorUserId: string;
    },
  ): Promise<PaymentTerminalView> {
    const entity = await this.getTerminal(input.tenantId, id);
    if (input.name !== undefined) {
      entity.name = this.requireTerminalName(input.name);
    }
    if (input.terminalCode !== undefined) {
      entity.terminalCode = this.requireTerminalCode(input.terminalCode);
    }
    if (input.isDefault === true && !entity.isDefault) {
      await this.unsetDefaults(input.tenantId, entity.branchId, input.actorUserId, entity.id);
      entity.isDefault = true;
    } else if (input.isDefault === false) {
      entity.isDefault = false;
    }
    if (input.status !== undefined) {
      entity.status = input.status;
    }
    entity.updatedBy = input.actorUserId;
    const saved = await this.terminalRepository.save(entity);
    await this.auditService.record({
      tenantId: input.tenantId,
      branchId: entity.branchId,
      actorUserId: input.actorUserId,
      entityType: 'payment_terminal',
      entityId: saved.id,
      action: 'finance.terminal.updated',
      eventType: 'finance.write',
      metadata: { branchId: entity.branchId, provider: entity.provider },
    });
    return this.toView(saved);
  }

  async resolveForCharge(tenantId: string, branchId: string, terminalId?: string): Promise<PaymentTerminalEntity> {
    const actives = await this.terminalRepository.findActiveByBranch(tenantId, branchId);
    if (terminalId) {
      const terminal = actives.find((candidate) => candidate.id === terminalId);
      if (!terminal) {
        throw new DomainValidationError('Terminal inválido ou inativo nesta filial.');
      }
      return terminal;
    }
    const defaultTerminal = actives.find((candidate) => candidate.isDefault);
    if (defaultTerminal) {
      return defaultTerminal;
    }
    if (actives.length === 1) {
      return actives[0];
    }
    if (actives.length === 0) {
      throw new DomainValidationError('Cadastre um terminal nesta filial em Configurações → Pagamentos → Terminais.');
    }
    throw new DomainValidationError('Escolha o terminal da cobrança.');
  }

  private async getTerminal(tenantId: string, id: string): Promise<PaymentTerminalEntity> {
    const entity = await this.terminalRepository.findById(id);
    if (!entity || entity.tenantId !== tenantId) {
      throw new EntityNotFoundError(`Payment terminal '${id}' was not found.`);
    }
    return entity;
  }

  private async unsetDefaults(tenantId: string, branchId: string, actorUserId: string, exceptId?: string): Promise<void> {
    const listed = await this.terminalRepository.findListedByBranch(tenantId, branchId);
    for (const terminal of listed) {
      if (!terminal.isDefault || terminal.id === exceptId) {
        continue;
      }
      terminal.isDefault = false;
      terminal.updatedBy = actorUserId;
      await this.terminalRepository.save(terminal);
    }
  }

  private requireTerminalName(value: string): string {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      throw new DomainValidationError('Informe o nome do terminal.');
    }
    return trimmed;
  }

  private requireTerminalCode(value: string): string {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      throw new DomainValidationError('Informe a identificação do terminal.');
    }
    return trimmed;
  }

  private toView(row: PaymentTerminalEntity): PaymentTerminalView {
    return {
      id: row.id,
      branchId: row.branchId,
      provider: row.provider,
      name: row.name,
      terminalCode: row.terminalCode,
      isDefault: row.isDefault,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
