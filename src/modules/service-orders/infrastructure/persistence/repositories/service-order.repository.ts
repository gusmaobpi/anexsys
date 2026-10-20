import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { DeliveryType, ServiceOrderStatus } from 'src/shared/domain/enums';
import { ServiceOrderEntity } from '../entities/service-order.entity';

export interface ServiceOrderSearchFilters {
  q?: string;
  branchId?: string;
  customerId?: string;
  status?: ServiceOrderStatus;
  deliveryType?: DeliveryType;
  accessibleBranchIds: string[];
}

@Injectable()
export class ServiceOrderRepository {
  constructor(
    @InjectRepository(ServiceOrderEntity)
    private readonly repository: Repository<ServiceOrderEntity>,
  ) {}

  create(payload: Partial<ServiceOrderEntity>): ServiceOrderEntity {
    return this.repository.create(payload);
  }

  async save(order: ServiceOrderEntity): Promise<ServiceOrderEntity> {
    return this.repository.save(order);
  }

  async findById(id: string): Promise<ServiceOrderEntity | null> {
    return this.repository.findOne({ where: { id, isDeleted: false } });
  }

  async findByPublicToken(publicToken: string): Promise<ServiceOrderEntity | null> {
    return this.repository.findOne({ where: { publicToken, isDeleted: false } });
  }

  async findActiveFloorBags(
    tenantId: string,
    branchId: string,
    excludeId: string,
    holderUserId?: string,
  ): Promise<ServiceOrderEntity[]> {
    const rows = await this.repository.find({
      where: {
        tenantId,
        branchId,
        isDeleted: false,
        id: Not(excludeId),
        status: In([ServiceOrderStatus.IN_PRODUCTION, ServiceOrderStatus.IN_REWORK]),
      },
      order: { openedAt: 'DESC' },
    });
    if (!holderUserId) {
      return rows;
    }
    return rows.filter((row) => !row.floorHolderUserId || row.floorHolderUserId === holderUserId);
  }

  async findByGroupId(tenantId: string, groupId: string): Promise<ServiceOrderEntity[]> {
    return this.repository.find({
      where: { tenantId, groupId, isDeleted: false },
      order: { versionSuffix: 'ASC', openedAt: 'ASC' },
    });
  }

  async findByGroupIds(tenantId: string, groupIds: string[]): Promise<ServiceOrderEntity[]> {
    if (groupIds.length === 0) {
      return [];
    }
    return this.repository.find({
      where: { tenantId, groupId: In(groupIds), isDeleted: false },
      order: { versionSuffix: 'ASC', openedAt: 'ASC' },
    });
  }

  async findByOriginServiceOrderId(tenantId: string, originServiceOrderId: string): Promise<ServiceOrderEntity[]> {
    return this.repository.find({
      where: { tenantId, originServiceOrderId, isDeleted: false },
      order: { openedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async nextGroupSeq(tenantId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('service_order')
      .select('COALESCE(MAX(service_order.group_seq), 0)', 'maxSeq')
      .where('service_order.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ maxSeq: string }>();
    return Number(result?.maxSeq ?? 0) + 1;
  }

  async search(tenantId: string, filters: ServiceOrderSearchFilters): Promise<ServiceOrderEntity[]> {
    const query = this.repository
      .createQueryBuilder('service_order')
      .leftJoin('customers', 'customer', 'customer.id = service_order.customer_id')
      .where('service_order.tenant_id = :tenantId', { tenantId })
      .andWhere('service_order.is_deleted = false');

    if (filters.accessibleBranchIds.length === 0) {
      query.andWhere('1 = 0');
    } else {
      query.andWhere('service_order.branch_id IN (:...accessibleBranchIds)', {
        accessibleBranchIds: filters.accessibleBranchIds,
      });
    }

    if (filters.branchId) {
      query.andWhere('service_order.branch_id = :branchId', { branchId: filters.branchId });
    }

    if (filters.customerId) {
      query.andWhere('service_order.customer_id = :customerId', { customerId: filters.customerId });
    }

    if (filters.status) {
      query.andWhere('service_order.status = :status', { status: filters.status });
    }

    if (filters.deliveryType) {
      query.andWhere('service_order.delivery_type = :deliveryType', { deliveryType: filters.deliveryType });
    }

    if (filters.q?.trim()) {
      const normalizedQuery = `%${filters.q.trim().toLowerCase()}%`;
      query.andWhere(
        new Brackets((searchQuery) => {
          searchQuery
            .where('LOWER(service_order.order_no) LIKE :normalizedQuery', { normalizedQuery })
            .orWhere("LOWER(COALESCE(service_order.commercial_notes, '')) LIKE :normalizedQuery", { normalizedQuery })
            .orWhere("LOWER(COALESCE(service_order.customer_notes, '')) LIKE :normalizedQuery", { normalizedQuery })
            .orWhere("LOWER(COALESCE(customer.legal_name, '')) LIKE :normalizedQuery", { normalizedQuery });
        }),
      );
    }

    return query.orderBy('service_order.opened_at', 'DESC').addOrderBy('service_order.created_at', 'DESC').getMany();
  }
}
