import { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagingChannels1760000064000 implements MigrationInterface {
  name = 'MessagingChannels1760000064000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS messaging_channels (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL UNIQUE,
        zenvia_api_token text NOT NULL DEFAULT '',
        whatsapp_sender varchar(20) NOT NULL DEFAULT '',
        sms_sender varchar(20) NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON messaging_channels TO anexsys_app;
          ALTER TABLE messaging_channels ENABLE ROW LEVEL SECURITY;
          ALTER TABLE messaging_channels FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS tenant_isolation ON messaging_channels;
          CREATE POLICY tenant_isolation ON messaging_channels
            USING (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            )
            WITH CHECK (
              current_setting('app.rls_bypass', true) = 'on'
              OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
            );
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS messaging_channels');
  }
}
