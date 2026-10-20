import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkGroups1760000048000 implements MigrationInterface {
  name = 'WorkGroups1760000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_groups (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        code varchar(100) NOT NULL,
        display_name text NOT NULL,
        description text NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_work_groups_tenant_code
      ON work_groups (tenant_id, code)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_group_members (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        work_group_id uuid NOT NULL REFERENCES work_groups(id),
        user_id uuid NOT NULL REFERENCES user_identities(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NOT NULL,
        row_version bigint NOT NULL DEFAULT 1
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_work_group_members_tenant_user
      ON work_group_members (tenant_id, user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS work_group_members`);
    await queryRunner.query(`DROP TABLE IF EXISTS work_groups`);
  }
}
