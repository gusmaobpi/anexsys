import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceOrderQualityStatus1760000029000 } from 'src/platform/database/typeorm/migrations/1760000029000-service-order-quality-status';

describe('ServiceOrderQualityStatus1760000029000', () => {
  it('replaces the OS status check so quality and ready_for_pickup are allowed', async () => {
    const executedQueries: string[] = [];
    const migration = new ServiceOrderQualityStatus1760000029000();

    await migration.up({
      async query(sql: string) {
        executedQueries.push(sql);
      },
    } as never);

    assert.equal(executedQueries.length, 3);
    assert.match(executedQueries[0] ?? '', /UPDATE service_orders/);
    assert.match(executedQueries[0] ?? '', /WHEN 'retirado' THEN 'picked_up'/);
    assert.match(executedQueries[0] ?? '', /WHEN 'aguardando_qualidade' THEN 'awaiting_quality'/);
    assert.match(executedQueries[0] ?? '', /WHEN 'aguardando_prova' THEN 'awaiting_proof'/);
    assert.match(executedQueries[1] ?? '', /DROP CONSTRAINT IF EXISTS chk_service_orders_status/);
    assert.match(executedQueries[2] ?? '', /ADD CONSTRAINT chk_service_orders_status/);
    assert.match(executedQueries[2] ?? '', /'quality'/);
    assert.match(executedQueries[2] ?? '', /'ready_for_pickup'/);
    assert.match(executedQueries[2] ?? '', /'awaiting_quality'/);
    assert.match(executedQueries[2] ?? '', /'awaiting_proof'/);
    assert.match(executedQueries[2] ?? '', /'picked_up'/);
  });
});
