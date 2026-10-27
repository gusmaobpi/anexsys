import { MigrationInterface, QueryRunner } from 'typeorm';

export class FloorItemFinish1760000060000 implements MigrationInterface {
  name = 'FloorItemFinish1760000060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE floor_diary_entries
        ADD COLUMN IF NOT EXISTS service_order_item_id uuid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE floor_diary_entries
        DROP COLUMN IF EXISTS service_order_item_id;
    `);
  }
}
