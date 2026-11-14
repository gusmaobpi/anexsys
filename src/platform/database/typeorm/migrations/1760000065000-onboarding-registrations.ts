import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingRegistrations1760000065000 implements MigrationInterface {
  name = 'OnboardingRegistrations1760000065000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS onboarding_registrations (
        id uuid PRIMARY KEY,
        company_name varchar(160) NOT NULL,
        cnpj varchar(20),
        admin_name varchar(160) NOT NULL,
        email varchar(180) NOT NULL,
        phone varchar(30) NOT NULL,
        password_hash text NOT NULL,
        verification_code varchar(12) NOT NULL,
        expires_at timestamptz NOT NULL,
        verified_at timestamptz,
        provisioned_tenant_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_registrations TO anexsys_app;
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS onboarding_registrations');
  }
}
