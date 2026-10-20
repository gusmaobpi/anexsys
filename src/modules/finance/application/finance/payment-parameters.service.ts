import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { TenantRepository } from 'src/modules/tenant/infrastructure/persistence/repositories/tenant.repository';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';

export const MACHINE_WAIT_MINUTES_DEFAULT = 3;
export const MACHINE_WAIT_MINUTES_MIN = 1;
export const MACHINE_WAIT_MINUTES_MAX = 30;
export const MACHINE_WAIT_AUDIT_ACTION = 'finance.machine_wait.updated';

export type PaymentParameterChange = {
  occurredAt: string;
  actorName: string;
  previousMinutes: number;
  newMinutes: number;
};

export type PaymentParametersView = {
  machineWaitMinutes: number;
  history: PaymentParameterChange[];
};

@Injectable()
export class PaymentParametersService {
  constructor(
    @Inject(TenantRepository)
    private readonly tenantRepository: TenantRepository,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
  ) {}

  async get(tenantId: string): Promise<PaymentParametersView> {
    const tenant = await this.requireTenant(tenantId);
    return this.toView(tenant.id, this.readMinutes(tenant.machineWaitMinutes));
  }

  async update(tenantId: string, actorUserId: string, machineWaitMinutes: number): Promise<PaymentParametersView> {
    if (!Number.isInteger(machineWaitMinutes) || machineWaitMinutes < MACHINE_WAIT_MINUTES_MIN || machineWaitMinutes > MACHINE_WAIT_MINUTES_MAX) {
      throw new DomainValidationError('O tempo de espera fica entre 1 e 30 minutos.');
    }

    const tenant = await this.requireTenant(tenantId);
    const previous = this.readMinutes(tenant.machineWaitMinutes);
    if (previous !== machineWaitMinutes) {
      tenant.machineWaitMinutes = machineWaitMinutes;
      tenant.updatedBy = actorUserId;
      await this.tenantRepository.save(tenant);
      await this.auditService.record({
        tenantId: tenant.id,
        actorUserId,
        entityType: 'tenant',
        entityId: tenant.id,
        action: MACHINE_WAIT_AUDIT_ACTION,
        eventType: 'finance.write',
        previousValues: { machineWaitMinutes: previous },
        newValues: { machineWaitMinutes },
      });
    }

    return this.toView(tenant.id, machineWaitMinutes);
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new EntityNotFoundError(`Tenant '${tenantId}' was not found.`);
    }
    return tenant;
  }

  private readMinutes(value: number | null | undefined): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    return MACHINE_WAIT_MINUTES_DEFAULT;
  }

  private async toView(tenantId: string, machineWaitMinutes: number): Promise<PaymentParametersView> {
    const events = await this.auditService.listByAction(tenantId, MACHINE_WAIT_AUDIT_ACTION, 20);
    const users = events.length > 0 ? await this.identityService.listByTenant(tenantId) : [];
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    const history: PaymentParameterChange[] = [];
    for (const event of events) {
      const previousMinutes = this.readAuditMinutes(event.previousValues);
      const newMinutes = this.readAuditMinutes(event.newValues);
      if (previousMinutes === null || newMinutes === null) {
        continue;
      }
      history.push({
        occurredAt: event.occurredAt.toISOString(),
        actorName: event.actorUserId ? names.get(event.actorUserId) ?? 'Usuário removido' : 'Usuário removido',
        previousMinutes,
        newMinutes,
      });
    }
    return { machineWaitMinutes, history };
  }

  private readAuditMinutes(values: Record<string, unknown> | null): number | null {
    const value = values?.machineWaitMinutes;
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  }
}
