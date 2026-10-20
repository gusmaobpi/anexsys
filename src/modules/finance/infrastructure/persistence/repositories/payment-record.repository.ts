import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaymentDirection, PaymentMethod, PaymentRecordStatus } from 'src/shared/domain/enums';
import { PaymentRecordEntity } from '../entities/payment-record.entity';

export interface PaymentRecordSearchFilters {
  branchId?: string;
  serviceOrderId?: string;
  status?: PaymentRecordStatus;
  statuses?: PaymentRecordStatus[];
  paymentMethod?: PaymentMethod;
  paymentDirection?: PaymentDirection;
  fromReceivedDate?: string;
  toReceivedDate?: string;
  accessibleBranchIds: string[];
}

@Injectable()
export class PaymentRecordRepository {
  constructor(
    @InjectRepository(PaymentRecordEntity)
    private readonly repository: Repository<PaymentRecordEntity>,
  ) {}

  create(payload: Partial<PaymentRecordEntity>): PaymentRecordEntity {
    return this.repository.create(payload);
  }

  async save(entity: PaymentRecordEntity): Promise<PaymentRecordEntity> {
    return this.repository.save(entity);
  }

  async runInTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.repository.manager.transaction(callback);
  }

  async findById(id: string): Promise<PaymentRecordEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByServiceOrder(serviceOrderId: string): Promise<PaymentRecordEntity[]> {
    return this.repository.find({ where: { serviceOrderId }, order: { createdAt: 'ASC' } });
  }

  async findPendingByBillingScope(billingScopeId: string, manager?: EntityManager): Promise<PaymentRecordEntity | null> {
    const repository = manager ? manager.getRepository(PaymentRecordEntity) : this.repository;
    return repository.findOne({ where: { billingScopeId, status: PaymentRecordStatus.PENDING } });
  }

  async search(tenantId: string, filters: PaymentRecordSearchFilters): Promise<PaymentRecordEntity[]> {
    const query = this.repository.createQueryBuilder('payment').where('payment.tenant_id = :tenantId', { tenantId });
    if (filters.accessibleBranchIds.length === 0) {
      query.andWhere('1 = 0');
    } else {
      query.andWhere('payment.branch_id IN (:...accessibleBranchIds)', { accessibleBranchIds: filters.accessibleBranchIds });
    }
    if (filters.branchId) query.andWhere('payment.branch_id = :branchId', { branchId: filters.branchId });
    if (filters.serviceOrderId) query.andWhere('payment.service_order_id = :serviceOrderId', { serviceOrderId: filters.serviceOrderId });
    if (filters.status) query.andWhere('payment.status = :status', { status: filters.status });
    if (filters.statuses?.length) query.andWhere('payment.status IN (:...statuses)', { statuses: filters.statuses });
    if (filters.paymentMethod) query.andWhere('payment.payment_method = :paymentMethod', { paymentMethod: filters.paymentMethod });
    if (filters.paymentDirection) query.andWhere('payment.payment_direction = :paymentDirection', { paymentDirection: filters.paymentDirection });
    if (filters.fromReceivedDate) query.andWhere("payment.received_at IS NOT NULL AND payment.received_at::date >= :fromReceivedDate", { fromReceivedDate: filters.fromReceivedDate });
    if (filters.toReceivedDate) query.andWhere("payment.received_at IS NOT NULL AND payment.received_at::date <= :toReceivedDate", { toReceivedDate: filters.toReceivedDate });
    return query.orderBy('COALESCE(payment.received_at, payment.created_at)', 'DESC').addOrderBy('payment.created_at', 'DESC').getMany();
  }
}
