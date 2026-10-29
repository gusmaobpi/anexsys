import { MigrationInterface, QueryRunner } from 'typeorm';

export class BrandImages1760000062000 implements MigrationInterface {
  name = 'BrandImages1760000062000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS logo_mime_type varchar(30),
        ADD COLUMN IF NOT EXISTS logo_base64 text
    `);
    await queryRunner.query(`
      ALTER TABLE user_identities
        ADD COLUMN IF NOT EXISTS portrait_mime_type varchar(30),
        ADD COLUMN IF NOT EXISTS portrait_base64 text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE companies
        DROP COLUMN IF EXISTS logo_mime_type,
        DROP COLUMN IF EXISTS logo_base64
    `);
    await queryRunner.query(`
      ALTER TABLE user_identities
        DROP COLUMN IF EXISTS portrait_mime_type,
        DROP COLUMN IF EXISTS portrait_base64
    `);
  }
}
