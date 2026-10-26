import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { CustomerInteractionType, InteractionChannel } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { MeasurementCatalogService } from '../measurement-catalog/measurement-catalog.service';
import { CustomerService } from '../customer/customer.service';
import { CreateMeasurementRecordDto } from '../../contracts/dto/create-measurement-record.dto';
import { CustomerInteractionEntity } from '../../infrastructure/persistence/entities/customer-interaction.entity';
import { MeasurementBodyPartEntity } from '../../infrastructure/persistence/entities/measurement-body-part.entity';
import { MeasurementSetEntity } from '../../infrastructure/persistence/entities/measurement-set.entity';
import { MeasurementSetItemEntity } from '../../infrastructure/persistence/entities/measurement-set-item.entity';
import { MeasurementUnitEntity } from '../../infrastructure/persistence/entities/measurement-unit.entity';
import { MeasurementSetItemRepository } from '../../infrastructure/persistence/repositories/measurement-set-item.repository';
import { MeasurementSetRepository } from '../../infrastructure/persistence/repositories/measurement-set.repository';

export type MeasurementSetView = {
  id: string;
  customerId: string;
  measurementDate: string;
  notes: string | null;
  createdBy: string;
  versionNo: number;
  items: Array<{
    id: string;
    bodyPartId: string;
    bodyPartCode: string;
    bodyPartDisplayName: string;
    measurementUnitId: string;
    measurementUnitCode: string;
    measurementUnitDisplayName: string;
    measuredValue: number;
    notes: string | null;
  }>;
};

@Injectable()
export class MeasurementService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(CustomerService)
    private readonly customerService: CustomerService,
    @Inject(MeasurementSetRepository)
    private readonly measurementSetRepository: MeasurementSetRepository,
    @Inject(MeasurementSetItemRepository)
    private readonly measurementSetItemRepository: MeasurementSetItemRepository,
    @Inject(MeasurementCatalogService)
    private readonly measurementCatalogService: MeasurementCatalogService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateMeasurementRecordDto): Promise<MeasurementSetView> {
    const customer = await this.customerService.getById(dto.customerId, dto.tenantId);
    const measurementDate = dto.measurementDate ? dto.measurementDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const items = await this.normalizeItems(dto);
    const nextVersion = (await this.measurementSetRepository.findLatestVersionNumber(dto.tenantId, dto.customerId)) + 1;

    const measurementSet = this.measurementSetRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      customerId: dto.customerId,
      serviceOrderId: null,
      measurementDate,
      notes: dto.notes?.trim() || null,
      capturedBy: dto.actorUserId,
      versionNo: nextVersion,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const savedMeasurementSet = await this.dataSource.transaction(async (manager) => {
      const savedSet = await manager.save(MeasurementSetEntity, manager.create(MeasurementSetEntity, measurementSet));
      const setItems = items.map((item) =>
        manager.create(MeasurementSetItemEntity, {
          id: randomUUID(),
          tenantId: dto.tenantId,
          measurementSetId: savedSet.id,
          bodyPartId: item.bodyPart.id,
          bodyPartCode: item.bodyPart.code,
          bodyPartDisplayName: item.bodyPart.displayName,
          measurementUnitId: item.unit.id,
          measurementUnitCode: item.unit.code,
          measurementUnitDisplayName: item.unit.displayName,
          measuredValue: item.value.toFixed(3),
          notes: item.notes,
          createdBy: dto.actorUserId,
          updatedBy: dto.actorUserId,
        }),
      );
      await manager.save(MeasurementSetItemEntity, setItems);

      const interaction = manager.create(CustomerInteractionEntity, {
        id: randomUUID(),
        tenantId: dto.tenantId,
        customerId: dto.customerId,
        serviceOrderId: null,
        interactionType: CustomerInteractionType.MEASUREMENT_RECORDED,
        channel: InteractionChannel.SYSTEM,
        occurredAt: new Date(),
        summary: `Measurement set version ${savedSet.versionNo} recorded.`,
        detail: `Measurement set '${savedSet.id}' captured for customer '${customer.legalName}' on ${savedSet.measurementDate}.`,
        createdBy: dto.actorUserId,
        updatedBy: dto.actorUserId,
      });
      await manager.save(CustomerInteractionEntity, interaction);
      return savedSet;
    });

    await this.auditService.record({
      tenantId: dto.tenantId,
      branchId: customer.branchId,
      actorUserId: dto.actorUserId,
      entityType: 'measurement_set',
      entityId: savedMeasurementSet.id,
      action: 'measurement.set.recorded',
      eventType: 'crm.write',
      metadata: {
        customerId: dto.customerId,
        versionNo: savedMeasurementSet.versionNo,
        itemCount: items.length,
      },
    });

    const listed = await this.listByCustomer(dto.tenantId, dto.customerId);
    return listed.measurementSets.find((entry) => entry.id === savedMeasurementSet.id)!;
  }

  async listByCustomer(tenantId: string, customerId: string): Promise<{
    history: Array<{ id: string; measurementLabel: string; measurementData: Record<string, unknown>; versionNo: number; measuredAt: Date; measurementSetId: string }>;
    latestByLabel: Array<{ id: string; measurementLabel: string; measurementData: Record<string, unknown>; versionNo: number; measuredAt: Date; measurementSetId: string }>;
    measurementSets: MeasurementSetView[];
  }> {
    await this.customerService.getById(customerId, tenantId);
    const measurementSets = await this.measurementSetRepository.findByCustomer(tenantId, customerId);
    const items = await this.measurementSetItemRepository.findByMeasurementSetIds(measurementSets.map((set) => set.id));
    const itemsBySetId = new Map<string, MeasurementSetItemEntity[]>();

    for (const item of items) {
      const current = itemsBySetId.get(item.measurementSetId) ?? [];
      current.push(item);
      itemsBySetId.set(item.measurementSetId, current);
    }

    const measurementSetViews = measurementSets.map((set) => ({
      id: set.id,
      customerId: set.customerId,
      measurementDate: set.measurementDate,
      notes: set.notes,
      createdBy: set.capturedBy,
      versionNo: set.versionNo,
      items: (itemsBySetId.get(set.id) ?? []).map((item) => ({
        id: item.id,
        bodyPartId: item.bodyPartId,
        bodyPartCode: item.bodyPartCode,
        bodyPartDisplayName: item.bodyPartDisplayName,
        measurementUnitId: item.measurementUnitId,
        measurementUnitCode: item.measurementUnitCode,
        measurementUnitDisplayName: item.measurementUnitDisplayName,
        measuredValue: Number(item.measuredValue),
        notes: item.notes,
      })),
    }));

    const history = measurementSetViews.flatMap((set) =>
      set.items.map((item) => ({
        id: item.id,
        measurementLabel: item.bodyPartCode.toLowerCase(),
        measurementData: {
          value: item.measuredValue,
          unit: item.measurementUnitCode,
          notes: item.notes,
          displayName: item.bodyPartDisplayName,
          bodyPartId: item.bodyPartId,
          unitId: item.measurementUnitId,
          measurementSetId: set.id,
        },
        versionNo: set.versionNo,
        measuredAt: new Date(`${set.measurementDate}T00:00:00.000Z`),
        measurementSetId: set.id,
      })),
    );

    const latestByLabelMap = new Map<string, (typeof history)[number]>();
    for (const record of history) {
      if (!latestByLabelMap.has(record.measurementLabel)) {
        latestByLabelMap.set(record.measurementLabel, record);
      }
    }

    return {
      history,
      latestByLabel: [...latestByLabelMap.values()],
      measurementSets: measurementSetViews,
    };
  }

  private async normalizeItems(dto: CreateMeasurementRecordDto): Promise<Array<{ bodyPart: MeasurementBodyPartEntity; unit: MeasurementUnitEntity; value: number; notes: string | null }>> {
    if (dto.items.length === 0) {
      throw new DomainValidationError('Inclua ao menos uma medida.');
    }

    const duplicateBodyParts = new Set<string>();
    const seenBodyParts = new Set<string>();
    for (const item of dto.items) {
      if (seenBodyParts.has(item.bodyPartId)) {
        duplicateBodyParts.add(item.bodyPartId);
      }
      seenBodyParts.add(item.bodyPartId);
    }
    if (duplicateBodyParts.size > 0) {
      throw new DomainValidationError('O conjunto de medidas não pode repetir a mesma parte do corpo.');
    }

    const bodyParts = await this.measurementCatalogService.resolveBodyParts(
      dto.tenantId,
      dto.items.map((item) => item.bodyPartId),
      dto.actorUserId,
    );
    const bodyPartById = new Map(bodyParts.map((item) => [item.id, item]));

    const explicitUnitIds = dto.items.flatMap((item) => (item.unitId ? [item.unitId] : []));
    const explicitUnits = await this.measurementCatalogService.resolveUnits(dto.tenantId, explicitUnitIds, dto.actorUserId);
    const unitById = new Map(explicitUnits.map((item) => [item.id, item]));
    const defaultUnit = await this.measurementCatalogService.getDefaultUnit(dto.tenantId, dto.actorUserId);

    return dto.items.map((item) => {
      const bodyPart = bodyPartById.get(item.bodyPartId);
      if (!bodyPart) {
        throw new DomainValidationError('A parte do corpo informada não é válida.');
      }
      const unit = item.unitId ? unitById.get(item.unitId) : defaultUnit;
      if (!unit) {
        throw new DomainValidationError('A unidade de medida informada não é válida.');
      }
      return {
        bodyPart,
        unit,
        value: item.value,
        notes: item.notes?.trim() || null,
      };
    });
  }
}
