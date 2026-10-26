import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthorizationService } from 'src/modules/authorization/application/authorization/authorization.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { CompanyService } from 'src/modules/company/application/company/company.service';
import { CustomerService } from 'src/modules/crm/application/customer/customer.service';
import { MeasurementCatalogService } from 'src/modules/crm/application/measurement-catalog/measurement-catalog.service';
import { MeasurementService } from 'src/modules/crm/application/measurement/measurement.service';
import { FinanceService } from 'src/modules/finance/application/finance/finance.service';
import { IdentityService } from 'src/modules/identity/application/identity/identity.service';
import { AtelierCatalogService } from 'src/modules/service-orders/application/atelier-catalog/atelier-catalog.service';
import { ServiceOrderService } from 'src/modules/service-orders/application/service-order/service-order.service';
import { ServiceOrderRepository } from 'src/modules/service-orders/infrastructure/persistence/repositories/service-order.repository';
import { BranchScopeType, CustomerStatus, ServiceOrderStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import {
  type ImportKind,
  type ImportRow,
  cell,
  isAlreadyExists,
  mapCustomerStatus,
  mapCustomerType,
  mapDeliveryType,
  mapPaymentMethod,
  mapPaymentModality,
  mapRoleCode,
  mapServiceOrderStatus,
  mapYesNo,
  parseMoney,
  linkedToMeasurementSheetMessage,
  linkedToServiceOrderMessage,
  parseOptionalGrade,
  requireCell,
  sameName,
} from './integration-import.rules';

export type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
  notices: string[];
};

type UnitOutcome = {
  status: 'created' | 'skipped';
  notices: string[];
};

type CatalogRef = UnitOutcome & { id: string };

@Injectable()
export class IntegrationImportService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(MeasurementCatalogService)
    private readonly measurementCatalogService: MeasurementCatalogService,
    @Inject(MeasurementService)
    private readonly measurementService: MeasurementService,
    @Inject(AtelierCatalogService)
    private readonly atelierCatalogService: AtelierCatalogService,
    @Inject(CompanyService)
    private readonly companyService: CompanyService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(AuthorizationService)
    private readonly authorizationService: AuthorizationService,
    @Inject(CustomerService)
    private readonly customerService: CustomerService,
    @Inject(ServiceOrderService)
    private readonly serviceOrderService: ServiceOrderService,
    @Inject(ServiceOrderRepository)
    private readonly serviceOrderRepository: ServiceOrderRepository,
    @Inject(FinanceService)
    private readonly financeService: FinanceService,
  ) {}

  async import(kind: ImportKind, tenantId: string, actorUserId: string, rows: ImportRow[]): Promise<ImportResult> {
    const result: ImportResult = { created: 0, skipped: 0, errors: [], notices: [] };
    const filled = rows.filter((row) =>
      Object.entries(row).some(([key, value]) => key !== '__line' && String(value ?? '').trim()),
    );
    if (kind === 'measurements') {
      await this.importMeasurements(tenantId, actorUserId, filled, result);
      return result;
    }
    if (kind === 'service-orders') {
      await this.importServiceOrders(tenantId, actorUserId, filled, result);
      return result;
    }
    for (const row of filled) {
      try {
        const outcome = await this.importRow(kind, tenantId, actorUserId, row);
        result.notices.push(...outcome.notices);
        if (outcome.status === 'skipped') result.skipped += 1;
        else result.created += 1;
      } catch (error) {
        if (isAlreadyExists(error)) {
          result.skipped += 1;
          continue;
        }
        this.pushError(result, row, error);
      }
    }
    return result;
  }

  private async importRow(kind: ImportKind, tenantId: string, actorUserId: string, row: ImportRow): Promise<UnitOutcome> {
    if (kind === 'body-parts') return this.ensureBodyPart(tenantId, actorUserId, requireCell(row, 'Nome'));
    if (kind === 'units') return this.ensureUnit(tenantId, actorUserId, requireCell(row, 'Código'), requireCell(row, 'Nome'));
    if (kind === 'products') {
      return this.ensureProduct(tenantId, actorUserId, requireCell(row, 'Nome'), this.incomingSort(cell(row, 'Ordem')));
    }
    if (kind === 'services') {
      return this.ensureService(
        tenantId,
        actorUserId,
        requireCell(row, 'Nome'),
        this.incomingSort(cell(row, 'Ordem')),
        this.incomingGrade(cell(row, 'Grau de dificuldade')),
      );
    }
    if (kind === 'prices') return this.importPrice(tenantId, actorUserId, row);
    if (kind === 'minute-rates') return this.importMinuteRate(tenantId, actorUserId, row);
    if (kind === 'users') return this.ensureUser(tenantId, actorUserId, row);
    if (kind === 'customers') {
      return this.ensureCustomer(tenantId, actorUserId, row, requireCell(row, 'Código no sistema antigo'), 'Status');
    }
    throw new DomainValidationError('Layout de importação desconhecido.');
  }

  private async ensureUser(tenantId: string, actorUserId: string, row: ImportRow): Promise<CatalogRef> {
    const email = (cell(row, 'E-mail') || cell(row, 'Email') || requireCell(row, 'E-mail do atendente')).toLowerCase();
    const displayName = cell(row, 'Nome exibido');
    const users = await this.identityService.listByTenant(tenantId);
    const current = users.find((item) => sameName(item.email, email));
    if (current) {
      if (!displayName || sameName(current.displayName, displayName)) {
        return { id: current.id, status: 'skipped', notices: [] };
      }
      if (await this.userOnServiceOrder(tenantId, current.id)) {
        return { id: current.id, status: 'skipped', notices: [linkedToServiceOrderMessage('Atendente')] };
      }
      await this.identityService.updateUser(current.id, { actorUserId, displayName });
      return { id: current.id, status: 'created', notices: [] };
    }
    const password = requireCell(row, 'Senha inicial');
    if (password.length < 8) throw new DomainValidationError('Senha inicial precisa ter no mínimo 8 caracteres.');
    const branches = await this.branchService.listByTenant(tenantId);
    const branchName = requireCell(row, 'Filial');
    const branch = branches.find((item) => sameName(item.displayName, branchName));
    if (!branch) throw new DomainValidationError(`Filial não encontrada: ${branchName}.`);
    const roles = await this.authorizationService.listRoles(tenantId);
    const role = roles.find((item) => item.code.toUpperCase() === mapRoleCode(requireCell(row, 'Papel')));
    if (!role) throw new DomainValidationError(`Papel não encontrado: ${cell(row, 'Papel')}.`);
    const allBranches = mapYesNo(requireCell(row, 'Todas as filiais'), 'Todas as filiais');
    const user = await this.identityService.createUser({
      tenantId,
      actorUserId,
      email,
      displayName: requireCell(row, 'Nome exibido'),
      password,
      defaultBranchId: branch.id,
    });
    await this.authorizationService.assignRole({
      tenantId,
      actorUserId,
      userId: user.id,
      roleId: role.id,
      assignedBranchId: allBranches ? undefined : branch.id,
      grantsAllBranches: allBranches,
    });
    await this.authorizationService.assignBranchScope({
      tenantId,
      actorUserId,
      userId: user.id,
      branchId: branch.id,
      scopeType: role.code.toUpperCase() === 'GERENTE' ? BranchScopeType.MANAGER : BranchScopeType.MEMBER,
    });
    return { id: user.id, status: 'created', notices: [] };
  }

  private async ensureCustomer(
    tenantId: string,
    actorUserId: string,
    row: ImportRow,
    legacyCode: string,
    statusHeader: 'Status' | 'Status do cliente',
  ): Promise<CatalogRef> {
    const existingId = await this.findCustomerId(tenantId, legacyCode);
    if (!existingId) {
      const status = mapCustomerStatus(requireCell(row, statusHeader));
      const created = await this.customerService.create({
        tenantId,
        actorUserId,
        customerType: mapCustomerType(requireCell(row, 'Tipo de cliente')),
        fullName: requireCell(row, 'Nome completo / razão social'),
        tradeName: cell(row, 'Nome fantasia') || undefined,
        mobilePhone: requireCell(row, 'Celular / WhatsApp').replace(/\D/g, ''),
        cpf: cell(row, 'CPF ou CNPJ').replace(/\D/g, '') || undefined,
        email: cell(row, 'E-mail') || cell(row, 'Email') || undefined,
        birthDate: cell(row, 'Data de nascimento') || undefined,
        postalCode: requireCell(row, 'CEP').replace(/\D/g, ''),
        street: requireCell(row, 'Rua'),
        number: requireCell(row, 'Número'),
        complement: cell(row, 'Complemento') || undefined,
        district: requireCell(row, 'Bairro'),
        city: requireCell(row, 'Cidade'),
        state: requireCell(row, 'Estado').toUpperCase(),
        country: requireCell(row, 'País'),
        observations: cell(row, 'Observações do cliente') || cell(row, 'Observações') || undefined,
        whatsappConsent: mapYesNo(requireCell(row, 'Autoriza aviso por WhatsApp'), 'Autoriza aviso por WhatsApp'),
      });
      await this.dataSource.query(`UPDATE customers SET legacy_code = $1 WHERE id = $2 AND tenant_id = $3`, [legacyCode, created.id, tenantId]);
      if (status === CustomerStatus.INACTIVE) await this.customerService.update(created.id, tenantId, { actorUserId, status });
      if (status === CustomerStatus.BLOCKED) {
        await this.dataSource.query(`UPDATE customers SET status = 'blocked' WHERE id = $1 AND tenant_id = $2`, [created.id, tenantId]);
      }
      return { id: created.id, status: 'created', notices: [] };
    }
    const customer = await this.customerService.getById(existingId, tenantId);
    const changes = this.customerChanges(customer, row, statusHeader);
    if (!changes) return { id: existingId, status: 'skipped', notices: [] };
    if (await this.customerOnServiceOrder(tenantId, existingId)) {
      return { id: existingId, status: 'skipped', notices: [linkedToServiceOrderMessage('Cliente')] };
    }
    const { status, ...rest } = changes;
    await this.customerService.update(existingId, tenantId, {
      actorUserId,
      ...rest,
      ...(status && status !== CustomerStatus.BLOCKED ? { status } : {}),
    });
    if (status === CustomerStatus.BLOCKED) {
      await this.dataSource.query(`UPDATE customers SET status = 'blocked' WHERE id = $1 AND tenant_id = $2`, [existingId, tenantId]);
    }
    return { id: existingId, status: 'created', notices: [] };
  }

  private async importMeasurements(tenantId: string, actorUserId: string, rows: ImportRow[], result: ImportResult) {
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const key = `${cell(row, 'Código do cliente no sistema antigo')}|${cell(row, 'Data da medição')}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      const first = group[0];
      try {
        const legacyCode = requireCell(first, 'Código do cliente no sistema antigo');
        const customer = await this.ensureCustomer(tenantId, actorUserId, first, legacyCode, 'Status');
        const writtenBefore = result.created;
        this.absorb(result, customer);
        const measurementDate = requireCell(first, 'Data da medição');
        if (await this.measurementOnServiceOrder(tenantId, customer.id, measurementDate)) {
          result.notices.push(linkedToServiceOrderMessage('Medida'));
          if (result.created === writtenBefore) result.skipped += 1;
          continue;
        }
        const items = [];
        for (const row of group) {
          const part = await this.ensureBodyPart(tenantId, actorUserId, requireCell(row, 'Parte do corpo'));
          this.absorb(result, part);
          const unit = await this.ensureUnit(tenantId, actorUserId, cell(row, 'Unidade') || 'CM', cell(row, 'Nome da unidade') || null);
          this.absorb(result, unit);
          items.push({
            bodyPartId: part.id,
            unitId: unit.id,
            value: parseMoney(requireCell(row, 'Valor')),
            notes: cell(row, 'Observações') || undefined,
          });
        }
        await this.measurementService.create({
          tenantId,
          actorUserId,
          customerId: customer.id,
          measurementDate,
          items,
        });
        result.created += 1;
      } catch (error) {
        this.pushError(result, first, error);
      }
    }
  }

  private async importServiceOrders(tenantId: string, actorUserId: string, rows: ImportRow[], result: ImportResult) {
    const branches = await this.branchService.listByTenant(tenantId);
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const key = cell(row, 'Número no sistema antigo');
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [legacyNo, group] of groups) {
      const first = group[0];
      try {
        if (!legacyNo) throw new DomainValidationError('Preencha Número no sistema antigo.');
        if (group.length > 5) throw new DomainValidationError('A ordem aceita no máximo 5 peças.');
        const writtenBefore = result.created;
        const customer = await this.ensureCustomer(
          tenantId,
          actorUserId,
          first,
          requireCell(first, 'Código do cliente no sistema antigo'),
          'Status do cliente',
        );
        this.absorb(result, customer);
        const branch = branches.find((item) => sameName(item.displayName, requireCell(first, 'Filial')));
        if (!branch) throw new DomainValidationError(`Filial não encontrada: ${cell(first, 'Filial')}.`);
        const attendant = await this.ensureUser(tenantId, actorUserId, first);
        this.absorb(result, attendant);
        const status = mapServiceOrderStatus(requireCell(first, 'Status'));
        const approval = cell(first, 'Aprovação');
        const paperNote = approval.toLowerCase() === 'assinado no papel' ? 'Aprovação importada: assinado no papel.' : '';
        const commercialNotes = [cell(first, 'Observação comercial'), paperNote].filter(Boolean).join('\n') || undefined;
        const ordered = [...group].sort((left, right) => Number(cell(left, 'Peça') || 0) - Number(cell(right, 'Peça') || 0));
        const items = [];
        for (const row of ordered) {
          const product = await this.ensureProduct(
            tenantId,
            actorUserId,
            requireCell(row, 'Produto'),
            this.incomingSort(cell(row, 'Ordem do produto')),
          );
          const service = await this.ensureService(
            tenantId,
            actorUserId,
            requireCell(row, 'Serviço'),
            this.incomingSort(cell(row, 'Ordem do serviço')),
            this.incomingGrade(cell(row, 'Grau do serviço')),
          );
          this.absorb(result, product);
          this.absorb(result, service);
          await this.ensureCatalogPrice(result, tenantId, actorUserId, product.id, service.id, row);
          const quantity = parseMoney(requireCell(row, 'Quantidade'));
          if (quantity <= 0) throw new DomainValidationError('Quantidade precisa ser maior que zero.');
          items.push({
            itemType: requireCell(row, 'Produto'),
            productId: product.id,
            serviceId: service.id,
            description: requireCell(row, 'Serviço'),
            complement: requireCell(row, 'Detalhamento do ajuste'),
            brand: requireCell(row, 'Marca'),
            model: cell(row, 'Modelo') || undefined,
            serialNo: cell(row, 'Série') || undefined,
            quantity,
            unitPrice: cell(row, 'Valor unitário') ? parseMoney(cell(row, 'Valor unitário')) : undefined,
            discountValue: cell(row, 'Desconto') ? parseMoney(cell(row, 'Desconto')) : undefined,
          });
        }
        const existing = await this.findServiceOrderId(tenantId, legacyNo);
        if (existing) {
          const headerChanged = await this.touchOrderHeader(existing, tenantId, actorUserId, first);
          if (headerChanged) result.created += 1;
          else if (result.created === writtenBefore) result.skipped += 1;
          continue;
        }
        const pickupDate = cell(first, 'Data da retirada');
        if (status === ServiceOrderStatus.PICKED_UP && !pickupDate) {
          throw new DomainValidationError('Preencha Data da retirada.');
        }
        const created = await this.serviceOrderService.create({
          tenantId,
          actorUserId,
          branchId: branch.id,
          customerId: customer.id,
          commercialResponsibleActorId: attendant.id,
          deliveryCommitmentSourceAt: `${requireCell(first, 'Data de entrada')}T12:00:00.000Z`,
          deliveryType: mapDeliveryType(requireCell(first, 'Tipo de entrega')),
          promisedDeliveryDate: requireCell(first, 'Data prevista'),
          promisedDeliveryTime: cell(first, 'Hora prevista') || undefined,
          difficultyGrade: parseOptionalGrade(cell(first, 'Grau de dificuldade')),
          commercialNotes,
          customerNotes: cell(first, 'Observação para o cliente') || undefined,
          items,
        });
        await this.dataSource.query(`UPDATE service_orders SET legacy_order_no = $1 WHERE id = $2 AND tenant_id = $3`, [
          legacyNo,
          created.serviceOrder.id,
          tenantId,
        ]);
        const approvalText = approval.toLowerCase();
        if (approvalText === 'concordou no balcão') {
          await this.serviceOrderService.completeApproval(tenantId, created.serviceOrder.id, actorUserId, { method: 'counter' });
        }
        if (approvalText === 'produção liberada' || approvalText === 'producao liberada') {
          await this.serviceOrderService.completeApproval(tenantId, created.serviceOrder.id, actorUserId, {
            method: 'release',
            releaseReason: 'Importação do sistema antigo',
          });
        }
        const received = parseMoney(cell(first, 'Valor recebido'));
        const method = mapPaymentMethod(cell(first, 'Forma de pagamento'));
        if (received > 0 && method) {
          await this.financeService.createPayment({
            tenantId,
            actorUserId,
            serviceOrderId: created.serviceOrder.id,
            paymentMethod: method,
            informedModality: method === 'card' ? mapPaymentModality(cell(first, 'Modalidade do cartão')) : null,
            paymentAmount: received,
            manualReason: 'Importação do sistema antigo',
            receivedAt: requireCell(first, 'Data de entrada'),
          });
        }
        const order = created.serviceOrder;
        order.status = status;
        order.bagClosed = ![ServiceOrderStatus.OPEN, ServiceOrderStatus.APPROVED, ServiceOrderStatus.CANCELLED].includes(status);
        order.actualPickupDate = pickupDate || null;
        order.updatedBy = actorUserId;
        await this.serviceOrderRepository.save(order);
        result.created += 1;
      } catch (error) {
        if (isAlreadyExists(error)) {
          result.skipped += 1;
          continue;
        }
        this.pushError(result, first, error);
      }
    }
  }

  private absorb(result: ImportResult, outcome: UnitOutcome) {
    result.notices.push(...outcome.notices);
    if (outcome.status === 'created') result.created += 1;
  }

  private async ensureCatalogPrice(
    result: ImportResult,
    tenantId: string,
    actorUserId: string,
    productId: string,
    serviceId: string,
    row: ImportRow,
  ) {
    const suggested = cell(row, 'Preço sugerido');
    const tempo = cell(row, 'Tempo previsto (minutos)');
    if (!suggested && !tempo) return;
    if (!suggested || !tempo) throw new DomainValidationError('Preencha Preço sugerido e Tempo previsto (minutos).');
    const minutes = Number(tempo);
    if (!Number.isInteger(minutes) || minutes < 1) {
      throw new DomainValidationError('Tempo previsto (minutos) precisa ser um número inteiro maior que zero.');
    }
    this.absorb(result, await this.ensurePrice(tenantId, actorUserId, productId, serviceId, parseMoney(suggested), minutes));
  }

  private async ensureBodyPart(tenantId: string, actorUserId: string, name: string): Promise<CatalogRef> {
    const parts = await this.measurementCatalogService.listBodyParts(tenantId, actorUserId);
    const current = parts.find((item) => sameName(item.displayName, name));
    if (current) return { id: current.id, status: 'skipped', notices: [] };
    const created = await this.measurementCatalogService.createBodyPart({ tenantId, actorUserId, displayName: name });
    return { id: created.id, status: 'created', notices: [] };
  }

  private async ensureUnit(tenantId: string, actorUserId: string, code: string, displayName: string | null): Promise<CatalogRef> {
    const units = await this.measurementCatalogService.listUnits(tenantId, actorUserId);
    const current = units.find((item) => sameName(item.code, code) || sameName(item.displayName, code));
    if (!current) {
      const created = await this.measurementCatalogService.createUnit({
        tenantId,
        actorUserId,
        code,
        displayName: displayName || code,
      });
      return { id: created.id, status: 'created', notices: [] };
    }
    if (!displayName || sameName(current.displayName, displayName)) {
      return { id: current.id, status: 'skipped', notices: [] };
    }
    const used = (await this.dataSource.query(
      `SELECT 1 FROM measurement_set_items WHERE tenant_id = $1 AND measurement_unit_id = $2 LIMIT 1`,
      [tenantId, current.id],
    )) as unknown[];
    if (used.length > 0) {
      return { id: current.id, status: 'skipped', notices: [linkedToMeasurementSheetMessage('Unidade')] };
    }
    await this.measurementCatalogService.updateUnit(current.id, { tenantId, actorUserId, displayName });
    return { id: current.id, status: 'created', notices: [] };
  }

  private async ensureProduct(tenantId: string, actorUserId: string, name: string, sortOrder: number | null): Promise<CatalogRef> {
    const products = await this.atelierCatalogService.listProducts(tenantId, actorUserId);
    const current = products.find((item) => sameName(item.displayName, name));
    if (!current) {
      const created = await this.atelierCatalogService.createProduct({
        tenantId,
        actorUserId,
        displayName: name,
        sortOrder: sortOrder ?? 0,
      });
      return { id: created.id, status: 'created', notices: [] };
    }
    if (sortOrder === null || sortOrder === current.sortOrder) {
      return { id: current.id, status: 'skipped', notices: [] };
    }
    if (await this.productOnServiceOrder(tenantId, current.id)) {
      return { id: current.id, status: 'skipped', notices: [linkedToServiceOrderMessage('Produto')] };
    }
    await this.atelierCatalogService.updateProduct(current.id, { tenantId, actorUserId, sortOrder });
    return { id: current.id, status: 'created', notices: [] };
  }

  private async ensureService(
    tenantId: string,
    actorUserId: string,
    name: string,
    sortOrder: number | null,
    grade: number | null | undefined,
  ): Promise<CatalogRef> {
    const services = await this.atelierCatalogService.listServices(tenantId, actorUserId);
    const current = services.find((item) => sameName(item.displayName, name));
    if (!current) {
      const created = await this.atelierCatalogService.createService({
        tenantId,
        actorUserId,
        displayName: name,
        sortOrder: sortOrder ?? 0,
        difficultyGrade: grade ?? null,
      });
      return { id: created.id, status: 'created', notices: [] };
    }
    const sortChanges = sortOrder !== null && sortOrder !== current.sortOrder;
    const gradeChanges = grade !== undefined && (current.difficultyGrade ?? null) !== grade;
    if (!sortChanges && !gradeChanges) return { id: current.id, status: 'skipped', notices: [] };
    if (await this.serviceOnServiceOrder(tenantId, current.id)) {
      return { id: current.id, status: 'skipped', notices: [linkedToServiceOrderMessage('Serviço')] };
    }
    await this.atelierCatalogService.updateService(current.id, {
      tenantId,
      actorUserId,
      ...(sortChanges ? { sortOrder } : {}),
      ...(gradeChanges ? { difficultyGrade: grade } : {}),
    });
    return { id: current.id, status: 'created', notices: [] };
  }

  private async importPrice(tenantId: string, actorUserId: string, row: ImportRow): Promise<UnitOutcome> {
    const product = await this.ensureProduct(tenantId, actorUserId, requireCell(row, 'Produto'), this.incomingSort(cell(row, 'Ordem do produto')));
    const service = await this.ensureService(
      tenantId,
      actorUserId,
      requireCell(row, 'Serviço'),
      this.incomingSort(cell(row, 'Ordem do serviço')),
      this.incomingGrade(cell(row, 'Grau de dificuldade')),
    );
    const minutes = Number(requireCell(row, 'Tempo previsto (minutos)'));
    if (!Number.isInteger(minutes) || minutes < 1) {
      throw new DomainValidationError('Tempo previsto (minutos) precisa ser um número inteiro maior que zero.');
    }
    const price = await this.ensurePrice(
      tenantId,
      actorUserId,
      product.id,
      service.id,
      parseMoney(requireCell(row, 'Preço sugerido')),
      minutes,
    );
    return {
      status: [product, service, price].some((item) => item.status === 'created') ? 'created' : 'skipped',
      notices: [...product.notices, ...service.notices, ...price.notices],
    };
  }

  private async ensurePrice(
    tenantId: string,
    actorUserId: string,
    productId: string,
    serviceId: string,
    suggestedPrice: number,
    minutes: number,
  ): Promise<UnitOutcome> {
    const prices = await this.atelierCatalogService.listProductServices(tenantId, actorUserId);
    const current = prices.find((item) => item.productId === productId && item.serviceId === serviceId);
    if (!current) {
      await this.atelierCatalogService.createProductService({
        tenantId,
        actorUserId,
        productId,
        serviceId,
        suggestedPrice,
        estimatedMinutes: minutes,
      });
      return { status: 'created', notices: [] };
    }
    const samePrice = Math.abs(Number(current.suggestedPrice) - suggestedPrice) <= 0.001;
    const sameMinutes = current.estimatedMinutes === minutes;
    if (samePrice && sameMinutes) return { status: 'skipped', notices: [] };
    if (await this.priceOnServiceOrder(tenantId, productId, serviceId)) {
      return { status: 'skipped', notices: [linkedToServiceOrderMessage('Preço')] };
    }
    await this.atelierCatalogService.updateProductService(current.id, {
      tenantId,
      actorUserId,
      suggestedPrice,
      estimatedMinutes: minutes,
    });
    return { status: 'created', notices: [] };
  }

  private async importMinuteRate(tenantId: string, actorUserId: string, row: ImportRow): Promise<UnitOutcome> {
    const companies = await this.companyService.listByTenant(tenantId);
    const name = requireCell(row, 'Empresa');
    const company = companies.find((item) => sameName(item.legalName, name) || (item.tradeName ? sameName(item.tradeName, name) : false));
    if (!company) throw new DomainValidationError(`Empresa não encontrada: ${name}.`);
    const value = parseMoney(requireCell(row, 'Valor por minuto'));
    const rates = await this.atelierCatalogService.listMinuteRates(tenantId, company.id);
    const current = rates.find((item) => item.status === 'active') ?? rates[0];
    if (!current) {
      await this.atelierCatalogService.createMinuteRate({ tenantId, actorUserId, companyId: company.id, valuePerMinute: value });
      return { status: 'created', notices: [] };
    }
    if (Math.abs(Number(current.valuePerMinute) - value) <= 0.001) return { status: 'skipped', notices: [] };
    await this.atelierCatalogService.updateMinuteRate(current.id, { tenantId, actorUserId, valuePerMinute: value });
    return { status: 'created', notices: [] };
  }

  private customerChanges(
    customer: { legalName: string; tradeName: string | null; customerType: string; phone: string; cpfCnpj: string | null; email: string | null; birthDate: string | Date | null; postalCode: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null; country: string | null; observations: string | null; status: CustomerStatus; whatsappConsent: boolean },
    row: ImportRow,
    statusHeader: 'Status' | 'Status do cliente',
  ) {
    const changes: {
      customerType?: ReturnType<typeof mapCustomerType>;
      fullName?: string;
      tradeName?: string;
      mobilePhone?: string;
      cpf?: string;
      email?: string;
      birthDate?: string;
      postalCode?: string;
      street?: string;
      number?: string;
      complement?: string;
      district?: string;
      city?: string;
      state?: string;
      country?: string;
      observations?: string;
      whatsappConsent?: boolean;
      status?: CustomerStatus;
    } = {};
    const typeText = cell(row, 'Tipo de cliente');
    if (typeText && mapCustomerType(typeText) !== customer.customerType) changes.customerType = mapCustomerType(typeText);
    const fullName = cell(row, 'Nome completo / razão social');
    if (fullName && !sameName(customer.legalName, fullName)) changes.fullName = fullName;
    const tradeName = cell(row, 'Nome fantasia');
    if (tradeName && !sameName(customer.tradeName ?? '', tradeName)) changes.tradeName = tradeName;
    const phone = cell(row, 'Celular / WhatsApp').replace(/\D/g, '');
    if (phone && phone !== (customer.phone ?? '').replace(/\D/g, '')) changes.mobilePhone = phone;
    const document = cell(row, 'CPF ou CNPJ').replace(/\D/g, '');
    if (document && document !== (customer.cpfCnpj ?? '').replace(/\D/g, '')) changes.cpf = document;
    const email = cell(row, 'E-mail') || cell(row, 'Email');
    if (email && !sameName(customer.email ?? '', email)) changes.email = email;
    const birthDate = cell(row, 'Data de nascimento');
    const currentBirth = customer.birthDate ? String(customer.birthDate).slice(0, 10) : '';
    if (birthDate && birthDate !== currentBirth) changes.birthDate = birthDate;
    const postalCode = cell(row, 'CEP').replace(/\D/g, '');
    if (postalCode && postalCode !== (customer.postalCode ?? '').replace(/\D/g, '')) changes.postalCode = postalCode;
    const street = cell(row, 'Rua');
    if (street && !sameName(customer.street ?? '', street)) changes.street = street;
    const number = cell(row, 'Número');
    if (number && (customer.number ?? '') !== number) changes.number = number;
    const complement = cell(row, 'Complemento');
    if (complement && !sameName(customer.complement ?? '', complement)) changes.complement = complement;
    const district = cell(row, 'Bairro');
    if (district && !sameName(customer.district ?? '', district)) changes.district = district;
    const city = cell(row, 'Cidade');
    if (city && !sameName(customer.city ?? '', city)) changes.city = city;
    const state = cell(row, 'Estado');
    if (state && (customer.state ?? '').toUpperCase() !== state.toUpperCase()) changes.state = state.toUpperCase();
    const country = cell(row, 'País');
    if (country && !sameName(customer.country ?? '', country)) changes.country = country;
    const observations = cell(row, 'Observações do cliente') || (statusHeader === 'Status' ? cell(row, 'Observações') : '');
    if (observations && (customer.observations ?? '') !== observations) changes.observations = observations;
    const consentText = cell(row, 'Autoriza aviso por WhatsApp');
    if (consentText) {
      const consent = mapYesNo(consentText, 'Autoriza aviso por WhatsApp');
      if (consent !== customer.whatsappConsent) changes.whatsappConsent = consent;
    }
    const statusText = cell(row, statusHeader);
    if (statusText) {
      const status = mapCustomerStatus(statusText);
      if (status !== customer.status) changes.status = status;
    }
    return Object.keys(changes).length ? changes : null;
  }

  private async productOnServiceOrder(tenantId: string, productId: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM service_order_items WHERE tenant_id = $1 AND product_id = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, productId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async serviceOnServiceOrder(tenantId: string, serviceId: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM service_order_items WHERE tenant_id = $1 AND service_id = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, serviceId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async priceOnServiceOrder(tenantId: string, productId: string, serviceId: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM service_order_items WHERE tenant_id = $1 AND product_id = $2 AND service_id = $3 AND is_deleted = false LIMIT 1`,
      [tenantId, productId, serviceId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async customerOnServiceOrder(tenantId: string, customerId: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM service_orders WHERE tenant_id = $1 AND customer_id = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, customerId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async userOnServiceOrder(tenantId: string, userId: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM service_orders WHERE tenant_id = $1 AND commercial_responsible_actor_id = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, userId],
    )) as unknown[];
    return rows.length > 0;
  }

  private async measurementOnServiceOrder(tenantId: string, customerId: string, measurementDate: string) {
    const rows = (await this.dataSource.query(
      `SELECT 1 FROM measurement_sets WHERE tenant_id = $1 AND customer_id = $2 AND measurement_date = $3 AND service_order_id IS NOT NULL LIMIT 1`,
      [tenantId, customerId, measurementDate],
    )) as unknown[];
    return rows.length > 0;
  }

  private async touchOrderHeader(orderId: string, tenantId: string, actorUserId: string, row: ImportRow) {
    const order = await this.serviceOrderRepository.findById(orderId);
    if (!order || order.tenantId !== tenantId) return false;
    const commercial = cell(row, 'Observação comercial') || null;
    const customerNotes = cell(row, 'Observação para o cliente') || null;
    const promised = requireCell(row, 'Data prevista');
    const time = cell(row, 'Hora prevista') || null;
    const pickup = cell(row, 'Data da retirada') || null;
    const changed =
      (order.commercialNotes ?? null) !== commercial ||
      (order.customerNotes ?? null) !== customerNotes ||
      order.promisedDeliveryDate !== promised ||
      (order.promisedDeliveryTime ?? null) !== time ||
      (order.actualPickupDate ?? null) !== (pickup || null);
    if (!changed) return false;
    order.commercialNotes = commercial;
    order.customerNotes = customerNotes;
    order.promisedDeliveryDate = promised;
    order.promisedDeliveryTime = time;
    order.actualPickupDate = pickup || null;
    order.updatedBy = actorUserId;
    await this.serviceOrderRepository.save(order);
    return true;
  }

  private incomingSort(value: string) {
    if (!value.trim()) return null;
    return this.optionalSort(value);
  }

  private incomingGrade(value: string) {
    if (!value.trim()) return undefined;
    return parseOptionalGrade(value);
  }

  private async findCustomerId(tenantId: string, legacyCode: string) {
    const rows = (await this.dataSource.query(
      `SELECT id FROM customers WHERE tenant_id = $1 AND legacy_code = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, legacyCode],
    )) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  private async findServiceOrderId(tenantId: string, legacyNo: string) {
    const rows = (await this.dataSource.query(
      `SELECT id FROM service_orders WHERE tenant_id = $1 AND legacy_order_no = $2 AND is_deleted = false LIMIT 1`,
      [tenantId, legacyNo],
    )) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  private optionalSort(value: string) {
    if (!value.trim()) return 0;
    const sort = Number(value);
    if (!Number.isInteger(sort) || sort < 0) {
      throw new DomainValidationError('Ordem precisa ser um número inteiro.');
    }
    return sort;
  }

  private pushError(result: ImportResult, row: ImportRow, error: unknown) {
    const message = error instanceof Error ? error.message : 'Não foi possível gravar esta linha.';
    result.errors.push({ line: row.__line ?? 0, message });
  }

  async executeUnit(kind: ImportKind, tenantId: string, actorUserId: string, rows: ImportRow[]): Promise<UnitOutcome> {
    if (kind === 'measurements' || kind === 'service-orders') {
      const result: ImportResult = { created: 0, skipped: 0, errors: [], notices: [] };
      if (kind === 'measurements') await this.importMeasurements(tenantId, actorUserId, rows, result);
      else await this.importServiceOrders(tenantId, actorUserId, rows, result);
      if (result.errors[0]) throw new DomainValidationError(result.errors[0].message);
      return { status: result.created > 0 ? 'created' : 'skipped', notices: result.notices };
    }
    return this.importRow(kind, tenantId, actorUserId, rows[0]);
  }

  async applyAdjustment(kind: ImportKind, tenantId: string, actorUserId: string, source: ImportRow[], rows: ImportRow[]): Promise<string> {
    const original = source[0] ?? rows[0];
    const row = rows[0];
    if (!row) throw new DomainValidationError('A linha não tem dados para salvar.');
    if (kind === 'customers') {
      const previousCode = cell(original, 'Código no sistema antigo');
      const nextCode = requireCell(row, 'Código no sistema antigo');
      const customerId = await this.findCustomerId(tenantId, previousCode || nextCode);
      if (!customerId) throw new DomainValidationError('O cliente integrado não foi encontrado para aplicar o ajuste.');
      if (await this.customerOnServiceOrder(tenantId, customerId)) return linkedToServiceOrderMessage('Cliente');
      const status = mapCustomerStatus(requireCell(row, 'Status'));
      await this.customerService.update(customerId, tenantId, {
        actorUserId,
        customerType: mapCustomerType(requireCell(row, 'Tipo de cliente')),
        fullName: requireCell(row, 'Nome completo / razão social'),
        tradeName: cell(row, 'Nome fantasia') || undefined,
        mobilePhone: requireCell(row, 'Celular / WhatsApp').replace(/\D/g, ''),
        cpf: cell(row, 'CPF ou CNPJ').replace(/\D/g, '') || undefined,
        email: cell(row, 'E-mail') || cell(row, 'Email') || undefined,
        birthDate: cell(row, 'Data de nascimento') || undefined,
        postalCode: requireCell(row, 'CEP').replace(/\D/g, ''),
        street: requireCell(row, 'Rua'),
        number: requireCell(row, 'Número'),
        complement: cell(row, 'Complemento') || undefined,
        district: requireCell(row, 'Bairro'),
        city: requireCell(row, 'Cidade'),
        state: requireCell(row, 'Estado').toUpperCase(),
        country: requireCell(row, 'País'),
        observations: cell(row, 'Observações') || undefined,
        whatsappConsent: mapYesNo(requireCell(row, 'Autoriza aviso por WhatsApp'), 'Autoriza aviso por WhatsApp'),
        ...(status === CustomerStatus.BLOCKED ? {} : { status }),
      });
      if (status === CustomerStatus.BLOCKED) {
        await this.dataSource.query(`UPDATE customers SET status = 'blocked' WHERE id = $1 AND tenant_id = $2`, [customerId, tenantId]);
      }
      if (nextCode !== previousCode) {
        await this.dataSource.query(`UPDATE customers SET legacy_code = $1 WHERE id = $2 AND tenant_id = $3`, [nextCode, customerId, tenantId]);
      }
      return 'Cliente atualizado.';
    }
    if (kind === 'products') {
      const products = await this.atelierCatalogService.listProducts(tenantId, actorUserId);
      const current = products.find((item) => sameName(item.displayName, cell(original, 'Nome')));
      if (!current) throw new DomainValidationError('O produto integrado não foi encontrado.');
      if (await this.productOnServiceOrder(tenantId, current.id)) return linkedToServiceOrderMessage('Produto');
      await this.atelierCatalogService.updateProduct(current.id, {
        tenantId,
        actorUserId,
        displayName: requireCell(row, 'Nome'),
        sortOrder: this.optionalSort(cell(row, 'Ordem')),
      });
      return 'Produto atualizado.';
    }
    if (kind === 'services') {
      const services = await this.atelierCatalogService.listServices(tenantId, actorUserId);
      const current = services.find((item) => sameName(item.displayName, cell(original, 'Nome')));
      if (!current) throw new DomainValidationError('O serviço integrado não foi encontrado.');
      if (await this.serviceOnServiceOrder(tenantId, current.id)) return linkedToServiceOrderMessage('Serviço');
      await this.atelierCatalogService.updateService(current.id, {
        tenantId,
        actorUserId,
        displayName: requireCell(row, 'Nome'),
        sortOrder: this.optionalSort(cell(row, 'Ordem')),
        difficultyGrade: parseOptionalGrade(cell(row, 'Grau de dificuldade')),
      });
      return 'Serviço atualizado.';
    }
    if (kind === 'body-parts') {
      const parts = await this.measurementCatalogService.listBodyParts(tenantId, actorUserId);
      const current = parts.find((item) => sameName(item.displayName, cell(original, 'Nome')));
      if (!current) throw new DomainValidationError('A parte do corpo integrada não foi encontrada.');
      const usedPart = (await this.dataSource.query(
        `SELECT 1 FROM measurement_set_items WHERE tenant_id = $1 AND body_part_id = $2 LIMIT 1`,
        [tenantId, current.id],
      )) as unknown[];
      if (usedPart.length > 0) return linkedToMeasurementSheetMessage('Parte do corpo');
      await this.measurementCatalogService.updateBodyPart(current.id, {
        tenantId,
        actorUserId,
        displayName: requireCell(row, 'Nome'),
      });
      return 'Parte do corpo atualizada.';
    }
    if (kind === 'units') {
      const units = await this.measurementCatalogService.listUnits(tenantId, actorUserId);
      const current = units.find((item) => sameName(item.code, cell(original, 'Código')) || sameName(item.displayName, cell(original, 'Nome')));
      if (!current) throw new DomainValidationError('A unidade integrada não foi encontrada.');
      const usedUnit = (await this.dataSource.query(
        `SELECT 1 FROM measurement_set_items WHERE tenant_id = $1 AND measurement_unit_id = $2 LIMIT 1`,
        [tenantId, current.id],
      )) as unknown[];
      if (usedUnit.length > 0) return linkedToMeasurementSheetMessage('Unidade');
      await this.measurementCatalogService.updateUnit(current.id, {
        tenantId,
        actorUserId,
        code: requireCell(row, 'Código'),
        displayName: requireCell(row, 'Nome'),
      });
      return 'Unidade atualizada.';
    }
    if (kind === 'prices') {
      const prices = await this.atelierCatalogService.listProductServices(tenantId, actorUserId);
      const current = prices.find(
        (item) => sameName(item.productName, cell(original, 'Produto')) && sameName(item.serviceName, cell(original, 'Serviço')),
      );
      if (!current) throw new DomainValidationError('O preço integrado não foi encontrado.');
      if (await this.priceOnServiceOrder(tenantId, current.productId, current.serviceId)) return linkedToServiceOrderMessage('Preço');
      const minutes = Number(requireCell(row, 'Tempo previsto (minutos)'));
      if (!Number.isInteger(minutes) || minutes < 1) {
        throw new DomainValidationError('Tempo previsto (minutos) precisa ser um número inteiro maior que zero.');
      }
      await this.atelierCatalogService.updateProductService(current.id, {
        tenantId,
        actorUserId,
        suggestedPrice: parseMoney(requireCell(row, 'Preço sugerido')),
        estimatedMinutes: minutes,
      });
      return 'Preço atualizado.';
    }
    if (kind === 'minute-rates') {
      const companies = await this.companyService.listByTenant(tenantId);
      const name = cell(original, 'Empresa');
      const company = companies.find((item) => sameName(item.legalName, name) || (item.tradeName ? sameName(item.tradeName, name) : false));
      if (!company) throw new DomainValidationError('A empresa deste valor por minuto não foi encontrada.');
      const rates = await this.atelierCatalogService.listMinuteRates(tenantId, company.id);
      const current = rates.find((item) => item.status === 'active') ?? rates[0];
      if (!current) throw new DomainValidationError('O valor por minuto integrado não foi encontrado.');
      await this.atelierCatalogService.updateMinuteRate(current.id, {
        tenantId,
        actorUserId,
        valuePerMinute: parseMoney(requireCell(row, 'Valor por minuto')),
      });
      return 'Valor por minuto atualizado.';
    }
    if (kind === 'users') {
      const users = await this.identityService.listByTenant(tenantId);
      const current = users.find((item) => sameName(item.email, cell(original, 'E-mail') || cell(original, 'Email')));
      if (!current) throw new DomainValidationError('O usuário integrado não foi encontrado.');
      if (await this.userOnServiceOrder(tenantId, current.id)) return linkedToServiceOrderMessage('Atendente');
      await this.identityService.updateUser(current.id, {
        actorUserId,
        displayName: requireCell(row, 'Nome exibido'),
        email: requireCell(row, 'E-mail').toLowerCase(),
      });
      return 'Nome e e-mail atualizados. Papel e filial continuam os do acesso.';
    }
    if (kind === 'measurements') {
      const outcome = await this.executeUnit(kind, tenantId, actorUserId, rows);
      if (outcome.notices[0]) return outcome.notices.join(' ');
      return 'Nova versão do conjunto de medidas gravada.';
    }
    const legacyNo = cell(original, 'Número no sistema antigo') || cell(row, 'Número no sistema antigo');
    const orderId = await this.findServiceOrderId(tenantId, legacyNo);
    if (!orderId) throw new DomainValidationError('A ordem integrada não foi encontrada.');
    const order = await this.serviceOrderRepository.findById(orderId);
    if (!order || order.tenantId !== tenantId) throw new DomainValidationError('A ordem integrada não foi encontrada.');
    order.commercialNotes = cell(row, 'Observação comercial') || null;
    order.customerNotes = cell(row, 'Observação para o cliente') || null;
    order.promisedDeliveryDate = requireCell(row, 'Data prevista');
    order.promisedDeliveryTime = cell(row, 'Hora prevista') || null;
    const pickupDate = cell(row, 'Data da retirada');
    if (pickupDate) order.actualPickupDate = pickupDate;
    order.updatedBy = actorUserId;
    await this.serviceOrderRepository.save(order);
    return 'Cabeçalho da ordem atualizado. As peças já integradas permanecem como foram gravadas.';
  }
}
