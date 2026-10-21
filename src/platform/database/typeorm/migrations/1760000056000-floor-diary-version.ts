import { MigrationInterface, QueryRunner } from 'typeorm';

export class FloorDiaryVersion1760000056000 implements MigrationInterface {
  name = 'FloorDiaryVersion1760000056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE floor_diary_entries
        ADD COLUMN IF NOT EXISTS production_order_version_id uuid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE floor_diary_entries
        DROP COLUMN IF EXISTS production_order_version_id;
    `);
  }
}
