import { MigrationInterface, QueryRunner } from 'typeorm';

export class FloorCollaborators1760000051000 implements MigrationInterface {
  name = 'FloorCollaborators1760000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE floor_technicians
      ADD COLUMN IF NOT EXISTS profile_code varchar(20),
      ADD COLUMN IF NOT EXISTS daily_rate numeric(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pieces_per_day integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE floor_technicians
          ADD CONSTRAINT chk_floor_technicians_profile
          CHECK (profile_code IS NULL OR profile_code IN ('tecnico', 'qualidade', 'gerente', 'atendente'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE floor_technicians DROP CONSTRAINT IF EXISTS chk_floor_technicians_profile');
    await queryRunner.query('ALTER TABLE floor_technicians DROP COLUMN IF EXISTS pieces_per_day');
    await queryRunner.query('ALTER TABLE floor_technicians DROP COLUMN IF EXISTS daily_rate');
    await queryRunner.query('ALTER TABLE floor_technicians DROP COLUMN IF EXISTS profile_code');
  }
}
