import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AtelierCatalogService } from 'src/modules/service-orders/application/atelier-catalog/atelier-catalog.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

function createService(
  repos: {
    products?: object;
    services?: object;
    assertGarmentProductCanDelete?: () => Promise<void>;
    assertAtelierServiceCanDelete?: () => Promise<void>;
    prices?: object;
    minuteRates?: object;
    company?: object;
  } = {},
) {
  return new AtelierCatalogService(
    {
      async getById() {
        return { id: 'tenant-1' };
      },
    } as never,
    {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async saveMany(payload: unknown[]) {
        return payload;
      },
      async findById() {
        return null;
      },
      async findListedByTenant() {
        return [];
      },
      async findActiveByTenant() {
        return [];
      },
      async findCodesByTenant() {
        return [];
      },
      async findByTenantAndCode() {
        return null;
      },
      async findByIds() {
        return [];
      },
      ...repos.products,
    } as never,
    {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async saveMany(payload: unknown[]) {
        return payload;
      },
      async findById() {
        return null;
      },
      async findListedByTenant() {
        return [];
      },
      async findActiveByTenant() {
        return [];
      },
      async findCodesByTenant() {
        return [];
      },
      async findByTenantAndCode() {
        return null;
      },
      async findByIds() {
        return [];
      },
      ...repos.services,
    } as never,
    { async record() {} } as never,
    {
      async assertGarmentProductCanDelete() {
        await repos.assertGarmentProductCanDelete?.();
      },
      async assertAtelierServiceCanDelete() {
        await repos.assertAtelierServiceCanDelete?.();
      },
    } as never,
    {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async findById() {
        return null;
      },
      async findListedByTenant() {
        return [];
      },
      async findActiveByProduct() {
        return [];
      },
      async findByProductAndService() {
        return null;
      },
      async findActiveByProductAndService() {
        return null;
      },
      ...repos.prices,
    } as never,
    {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async findById() {
        return null;
      },
      async findListedByCompany() {
        return [];
      },
      async findActiveByCompany() {
        return [];
      },
      ...repos.minuteRates,
    } as never,
    {
      async getById(id: string) {
        return { id, legalName: 'Empresa Teste', tradeName: null };
      },
      ...repos.company,
    } as never,
  );
}

describe('AtelierCatalogService', () => {
  it('seeds default products and services when the tenant catalog is empty', async () => {
    const savedProducts: unknown[] = [];
    const savedServices: unknown[] = [];
    const service = createService({
      products: {
        async saveMany(payload: unknown[]) {
          savedProducts.push(...payload);
          return payload;
        },
      },
      services: {
        async saveMany(payload: unknown[]) {
          savedServices.push(...payload);
          return payload;
        },
      },
    });

    await service.listProducts('tenant-1', 'user-1');

    assert.equal(savedProducts.length > 0, true);
    assert.equal(
      savedProducts.some((item) => (item as { displayName: string }).displayName === 'Calça'),
      true,
    );
    assert.equal(
      savedServices.some((item) => (item as { displayName: string }).displayName === 'Bainha'),
      true,
    );
  });

  it('rejects a duplicate product name', async () => {
    const service = createService({
      products: {
        async findByTenantAndCode() {
          return { id: 'product-1', displayName: 'Calça' };
        },
      },
    });

    await assert.rejects(
      () => service.createProduct({ tenantId: 'tenant-1', displayName: 'Calça', actorUserId: 'user-1' }),
      DomainValidationError,
    );
  });

  it('stores price and minutes on the product-service pair, not on the service', async () => {
    const saved: Record<string, unknown>[] = [];
    const service = createService({
      products: {
        async findByIds() {
          return [{ id: 'product-1', displayName: 'Calça', status: 'active' }];
        },
      },
      services: {
        async findByIds() {
          return [{ id: 'service-1', displayName: 'Barra Original', status: 'active' }];
        },
      },
      prices: {
        async save(payload: Record<string, unknown>) {
          saved.push(payload);
          return payload;
        },
      },
    });

    const created = await service.createProductService({
      tenantId: 'tenant-1',
      productId: 'product-1',
      serviceId: 'service-1',
      suggestedPrice: 25,
      estimatedMinutes: 15,
      actorUserId: 'user-1',
    });

    assert.equal(created.suggestedPrice, '25.00');
    assert.equal(created.estimatedMinutes, 15);
    assert.equal(created.productName, 'Calça');
    assert.equal(created.serviceName, 'Barra Original');
    assert.equal(saved[0]?.suggestedPrice, '25.00');
  });

  it('rejects a duplicate product-service pair', async () => {
    const service = createService({
      products: {
        async findByIds() {
          return [{ id: 'product-1', displayName: 'Calça', status: 'active' }];
        },
      },
      services: {
        async findByIds() {
          return [{ id: 'service-1', displayName: 'Barra Original', status: 'active' }];
        },
      },
      prices: {
        async findByProductAndService() {
          return { id: 'price-1' };
        },
      },
    });

    await assert.rejects(
      () =>
        service.createProductService({
          tenantId: 'tenant-1',
          productId: 'product-1',
          serviceId: 'service-1',
          suggestedPrice: 40,
          estimatedMinutes: 25,
          actorUserId: 'user-1',
        }),
      (error: unknown) => {
        assert.ok(error instanceof DomainValidationError);
        assert.match(error.message, /Já existe preço/);
        return true;
      },
    );
  });
});
