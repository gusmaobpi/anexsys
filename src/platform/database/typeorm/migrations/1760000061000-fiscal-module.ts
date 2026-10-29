import { MigrationInterface, QueryRunner } from 'typeorm';

const RLS = (table: string) => `
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexsys_app') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO anexsys_app;
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON ${table};
      CREATE POLICY tenant_isolation ON ${table}
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
`;

export class FiscalModule1760000061000 implements MigrationInterface {
  name = 'FiscalModule1760000061000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fiscal_documents
        ADD COLUMN IF NOT EXISTS company_id uuid,
        ADD COLUMN IF NOT EXISTS customer_id uuid,
        ADD COLUMN IF NOT EXISTS environment varchar(20),
        ADD COLUMN IF NOT EXISTS certificate_id uuid,
        ADD COLUMN IF NOT EXISTS protocol varchar(80),
        ADD COLUMN IF NOT EXISTS xml_content text,
        ADD COLUMN IF NOT EXISTS pdf_content bytea,
        ADD COLUMN IF NOT EXISTS cancellation_reason text,
        ADD COLUMN IF NOT EXISTS provider_message text
    `);
    await queryRunner.query(`ALTER TABLE fiscal_documents DROP CONSTRAINT IF EXISTS chk_fiscal_documents_type`);
    await queryRunner.query(`
      ALTER TABLE fiscal_documents
        ADD CONSTRAINT chk_fiscal_documents_type
        CHECK (document_type IN ('nfse', 'nfe', 'nfce', 'cte', 'mdfe', 'credit_document', 'debit_document'))
    `);
    await queryRunner.query(`
      ALTER TABLE atelier_services
        ADD COLUMN IF NOT EXISTS fiscal_code varchar(20),
        ADD COLUMN IF NOT EXISTS national_nfse_code varchar(20),
        ADD COLUMN IF NOT EXISTS municipal_code varchar(20),
        ADD COLUMN IF NOT EXISTS iss_rate numeric(8,4),
        ADD COLUMN IF NOT EXISTS iss_withheld boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS operation_nature varchar(80),
        ADD COLUMN IF NOT EXISTS fiscal_description text
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_settings (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        company_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        tax_regime varchar(40) NOT NULL DEFAULT '',
        main_cnae varchar(20) NOT NULL DEFAULT '',
        default_service_code varchar(20) NOT NULL DEFAULT '',
        default_iss_rate numeric(8,4) NOT NULL DEFAULT 0,
        fiscal_email varchar(200) NOT NULL DEFAULT '',
        fiscal_responsible varchar(160) NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        UNIQUE (tenant_id, branch_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_certificates (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        company_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        pfx_cipher text NOT NULL,
        password_cipher text NOT NULL,
        issued_at date NULL,
        expires_at date NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        CONSTRAINT chk_fiscal_certificates_status CHECK (status IN ('active', 'expired', 'replaced'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_environments (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        company_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        kind varchar(20) NOT NULL,
        is_selected boolean NOT NULL DEFAULT false,
        certificate_id uuid NULL,
        last_test_at timestamptz NULL,
        last_issue_at timestamptz NULL,
        updated_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, branch_id, kind),
        CONSTRAINT chk_fiscal_environments_kind CHECK (kind IN ('homologation', 'production'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_document_orders (
        tenant_id uuid NOT NULL,
        document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
        service_order_id uuid NOT NULL,
        PRIMARY KEY (document_id, service_order_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_batches (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        mode varchar(30) NOT NULL,
        status varchar(20) NOT NULL,
        total_count integer NOT NULL DEFAULT 0,
        processed_count integer NOT NULL DEFAULT 0,
        issued_count integer NOT NULL DEFAULT 0,
        error_count integer NOT NULL DEFAULT 0,
        created_by uuid NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz NULL,
        CONSTRAINT chk_fiscal_batches_mode CHECK (mode IN ('per_order', 'consolidated')),
        CONSTRAINT chk_fiscal_batches_status CHECK (status IN ('running', 'completed'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiscal_batch_lines (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        batch_id uuid NOT NULL REFERENCES fiscal_batches(id) ON DELETE CASCADE,
        service_order_id uuid NOT NULL,
        customer_id uuid NULL,
        status varchar(20) NOT NULL,
        message text NULL,
        document_id uuid NULL,
        CONSTRAINT chk_fiscal_batch_lines_status CHECK (status IN ('pending', 'issued', 'error'))
      )
    `);
    for (const table of ['fiscal_settings', 'fiscal_certificates', 'fiscal_environments', 'fiscal_document_orders', 'fiscal_batches', 'fiscal_batch_lines']) {
      await queryRunner.query(RLS(table));
    }
    await queryRunner.query(`
      INSERT INTO permissions (id, tenant_id, code, display_name, description, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, needed.code, needed.display_name, needed.description,
             sample.created_by, sample.created_by
      FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, created_by FROM permissions ORDER BY tenant_id, created_at
      ) sample
      CROSS JOIN (
        VALUES
          ('fiscal.read', 'Consultar fiscal', 'Vê histórico e pendências fiscais'),
          ('fiscal.write', 'Emitir fiscal', 'Emite e cancela NFS-e'),
          ('fiscal.admin', 'Administrar fiscal', 'Configura empresa, certificado e ambiente'),
          ('fiscal.audit', 'Auditar fiscal', 'Consulta a trilha fiscal')
      ) AS needed(code, display_name, description)
      WHERE NOT EXISTS (
        SELECT 1 FROM permissions existing
        WHERE existing.tenant_id = sample.tenant_id AND existing.code = needed.code
      )
    `);
    await queryRunner.query(`
      INSERT INTO roles (id, tenant_id, code, display_name, description, status, is_system_managed, created_by, updated_by)
      SELECT gen_random_uuid(), sample.tenant_id, needed.code, needed.display_name, needed.description, 'active', true, sample.created_by, sample.created_by
      FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, created_by FROM permissions ORDER BY tenant_id, created_at
      ) sample
      CROSS JOIN (
        VALUES
          ('FISCAL_ADMINISTRADOR', 'Fiscal Administrador', 'Configura e opera o módulo fiscal.'),
          ('FISCAL_EMISSOR', 'Fiscal Emissor', 'Emite, cancela e reprocessa notas.'),
          ('FISCAL_AUDITOR', 'Fiscal Auditor', 'Consulta a trilha fiscal.'),
          ('FISCAL_CONSULTA', 'Fiscal Consulta', 'Consulta histórico e pendências.')
      ) AS needed(code, display_name, description)
      WHERE NOT EXISTS (
        SELECT 1 FROM roles existing
        WHERE existing.tenant_id = sample.tenant_id AND upper(existing.code) = needed.code
      )
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_by, updated_by)
      SELECT gen_random_uuid(), r.tenant_id, r.id, p.id, r.created_by, r.created_by
      FROM roles r
      JOIN (
        VALUES
          ('FISCAL_ADMINISTRADOR', 'fiscal.admin'),
          ('FISCAL_ADMINISTRADOR', 'fiscal.write'),
          ('FISCAL_ADMINISTRADOR', 'fiscal.read'),
          ('FISCAL_ADMINISTRADOR', 'fiscal.audit'),
          ('FISCAL_EMISSOR', 'fiscal.write'),
          ('FISCAL_EMISSOR', 'fiscal.read'),
          ('FISCAL_AUDITOR', 'fiscal.audit'),
          ('FISCAL_AUDITOR', 'fiscal.read'),
          ('FISCAL_CONSULTA', 'fiscal.read'),
          ('MASTER_ADMINISTRATOR', 'fiscal.admin'),
          ('MASTER_ADMINISTRATOR', 'fiscal.write'),
          ('MASTER_ADMINISTRATOR', 'fiscal.read'),
          ('MASTER_ADMINISTRATOR', 'fiscal.audit'),
          ('GERENTE', 'fiscal.admin'),
          ('GERENTE', 'fiscal.write'),
          ('GERENTE', 'fiscal.read'),
          ('GERENTE', 'fiscal.audit')
      ) AS needed(role_code, code) ON upper(r.code) = needed.role_code
      JOIN permissions p ON p.tenant_id = r.tenant_id AND p.code = needed.code
      WHERE NOT EXISTS (
        SELECT 1 FROM role_permissions existing
        WHERE existing.role_id = r.id AND existing.permission_id = p.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_batch_lines');
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_batches');
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_document_orders');
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_environments');
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_certificates');
    await queryRunner.query('DROP TABLE IF EXISTS fiscal_settings');
  }
}
