import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceOrderQualityStatus1760000029000 implements MigrationInterface {
  name = 'ServiceOrderQualityStatus1760000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE service_orders
      SET status = CASE status
        WHEN 'in_quality' THEN 'quality'
        WHEN 'quality_control' THEN 'quality'
        WHEN 'controle_qualidade' THEN 'quality'
        WHEN 'em_qualidade' THEN 'quality'
        WHEN 'ready' THEN 'ready_for_pickup'
        WHEN 'pronto' THEN 'ready_for_pickup'
        WHEN 'pronto_para_retirada' THEN 'ready_for_pickup'
        WHEN 'retirado' THEN 'picked_up'
        WHEN 'delivered' THEN 'picked_up'
        WHEN 'aguardando_qualidade' THEN 'awaiting_quality'
        WHEN 'aguardando_prova' THEN 'awaiting_proof'
        WHEN 'em_producao' THEN 'in_production'
        WHEN 'em_produção' THEN 'in_production'
        WHEN 'em_refacao' THEN 'in_rework'
        WHEN 'em_refação' THEN 'in_rework'
        WHEN 'aprovada' THEN 'approved'
        WHEN 'cancelada' THEN 'cancelled'
        WHEN 'canceled' THEN 'cancelled'
        ELSE status
      END
      WHERE status NOT IN (
        'open',
        'approved',
        'cancelled',
        'in_production',
        'awaiting_proof',
        'awaiting_quality',
        'quality',
        'in_rework',
        'ready_for_pickup',
        'picked_up'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_status
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_status
      CHECK (status IN (
        'open',
        'approved',
        'cancelled',
        'in_production',
        'awaiting_proof',
        'awaiting_quality',
        'quality',
        'in_rework',
        'ready_for_pickup',
        'picked_up'
      ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_orders
      DROP CONSTRAINT IF EXISTS chk_service_orders_status
    `);
    await queryRunner.query(`
      ALTER TABLE service_orders
      ADD CONSTRAINT chk_service_orders_status
      CHECK (status IN ('open', 'approved', 'cancelled'))
    `);
  }
}
