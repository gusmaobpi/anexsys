import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPendingMigrations } from 'src/platform/database/typeorm/apply-pending-migrations';

function buildDataSource(runMigrations?: () => Promise<unknown>) {
  const executedQueries: string[] = [];
  const queryRunner = {
    async connect() {
      return undefined;
    },
    async release() {
      return undefined;
    },
    async query(sql: string) {
      executedQueries.push(sql);
      return [];
    },
  };

  return {
    executedQueries,
    dataSource: {
      async runMigrations() {
        if (runMigrations) {
          return runMigrations();
        }
        return [];
      },
      createQueryRunner() {
        return queryRunner;
      },
    },
  };
}

describe('applyPendingMigrations', () => {
  it('always issues the idempotent OS column and catalog SQL', async () => {
    const { dataSource, executedQueries } = buildDataSource();

    await applyPendingMigrations(dataSource as never);

    assert.equal(
      executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS promised_delivery_time')),
      true,
    );
    assert.equal(executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS garment_products')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS product_id')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS max_pieces_per_bag')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS group_id')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS version_suffix')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS actual_delivery_time')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS bag_closed')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS serial_no')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS time_minutes')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('DROP CONSTRAINT IF EXISTS chk_service_orders_status')), true);
    assert.equal(
      executedQueries.some((sql) => sql.includes("'quality'") && sql.includes("'ready_for_pickup'")),
      true,
    );
    assert.equal(executedQueries.some((sql) => sql.includes("'in_production'") && sql.includes("'in_rework'")), true);
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS origin_service_order_id')), true);
    assert.equal(executedQueries.some((sql) => sql.includes("'picked_up'")), true);
    assert.equal(executedQueries.some((sql) => sql.includes("'awaiting_proof'")), true);
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS service_order_proof_notes')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS service_order_pickups')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS service_order_approvals')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS garment_product_services')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS company_minute_rates')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS payment_provider_configs')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS payment_terminals')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('chk_payment_records_status') && sql.includes("'pending'")),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS card_brand')),
      true,
    );
    assert.equal(
      executedQueries.some((sql) => sql.includes('chk_payment_records_status') && sql.includes("'canceled'")),
      true,
    );
    assert.equal(executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS public_token')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('held_for_rework')), true);
    assert.equal(executedQueries.some((sql) => sql.includes('version_suffix TYPE varchar(8)')), true);
  });

  it('still repairs the schema when TypeORM cannot load the migration files', async () => {
    const { dataSource, executedQueries } = buildDataSource(async () => {
      throw new Error('No migrations found');
    });

    await applyPendingMigrations(dataSource as never);

    assert.equal(
      executedQueries.some((sql) => sql.includes('ADD COLUMN IF NOT EXISTS promised_delivery_time')),
      true,
    );
  });
});
