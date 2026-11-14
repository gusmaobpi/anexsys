import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';
import { DataSource } from 'typeorm';
import { RoleRepository } from 'src/modules/authorization/infrastructure/persistence/repositories/role.repository';
import { UserBranchScopeRepository } from 'src/modules/authorization/infrastructure/persistence/repositories/user-branch-scope.repository';
import { UserRoleAssignmentRepository } from 'src/modules/authorization/infrastructure/persistence/repositories/user-role-assignment.repository';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { sendSmtpMessage, type SmtpSecurity } from 'src/modules/email/application/smtp-mail';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { BranchScopeType } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { TenantProvisioningService } from './tenant-provisioning.service';

const scrypt = promisify(scryptCallback);

export type RequestOnboardingTokenInput = {
  companyName: string;
  cnpj?: string | null;
  adminName: string;
  email: string;
  phone: string;
  password: string;
};

export type VerifyOnboardingTokenInput = {
  registrationId: string;
  code: string;
};

@Injectable()
export class PublicOnboardingService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(TenantProvisioningService)
    private readonly tenantProvisioningService: TenantProvisioningService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(RoleRepository)
    private readonly roleRepository: RoleRepository,
    @Inject(UserRoleAssignmentRepository)
    private readonly userRoleAssignmentRepository: UserRoleAssignmentRepository,
    @Inject(UserBranchScopeRepository)
    private readonly userBranchScopeRepository: UserBranchScopeRepository,
  ) {}

  async requestToken(input: RequestOnboardingTokenInput) {
    const companyName = (input.companyName ?? '').trim();
    if (companyName.length < 2) {
      throw new DomainValidationError('Informe o nome do seu ateliê ou empresa.');
    }
    const adminName = (input.adminName ?? '').trim();
    if (adminName.length < 2) {
      throw new DomainValidationError('Informe o seu nome completo.');
    }
    const email = (input.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new DomainValidationError('Informe um e-mail válido para receber o código de confirmação.');
    }
    const phoneDigits = (input.phone ?? '').replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new DomainValidationError('Informe o celular com DDD (10 ou 11 dígitos).');
    }
    const password = input.password ?? '';
    if (password.length < 8) {
      throw new DomainValidationError('A senha precisa ter no mínimo 8 caracteres.');
    }
    const cleanCnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : null;
    if (cleanCnpj && cleanCnpj.length !== 14) {
      throw new DomainValidationError('Se informar o CNPJ, preencha os 14 dígitos.');
    }

    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const passwordHash = `${salt}:${derived.toString('hex')}`;
    const verificationCode = String(randomInt(100000, 999999));
    const registrationId = randomUUID();

    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      await this.dataSource.query(
        `INSERT INTO onboarding_registrations (
           id, company_name, cnpj, admin_name, email, phone,
           password_hash, verification_code, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '15 minutes')`,
        [registrationId, companyName, cleanCnpj, adminName, email, phoneDigits, passwordHash, verificationCode],
      );

      const emailed = await this.trySendVerificationEmail({
        to: email,
        adminName,
        companyName,
        code: verificationCode,
      });

      return {
        registrationId,
        email,
        emailSent: emailed.sent,
        emailNotice: emailed.sent
          ? `Enviamos o código de 6 dígitos para ${email}.`
          : `Caixa SMTP ainda não configurada neste ambiente. Para homologação, use o código de verificação gerado abaixo.`,
        homologCodePreview: emailed.sent ? null : verificationCode,
      };
    });
  }

  async verifyTokenAndProvision(input: VerifyOnboardingTokenInput) {
    const registrationId = (input.registrationId ?? '').trim();
    const code = (input.code ?? '').replace(/\D/g, '').trim();
    if (!registrationId || code.length !== 6) {
      throw new DomainValidationError('Informe o código de 6 dígitos recebido no seu e-mail.');
    }

    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
      const rows = (await this.dataSource.query(
        `SELECT id, company_name, cnpj, admin_name, email, phone,
                password_hash, verification_code, expires_at, verified_at, provisioned_tenant_id
           FROM onboarding_registrations
          WHERE id = $1
          LIMIT 1`,
        [registrationId],
      )) as Array<{
        id: string;
        company_name: string;
        cnpj: string | null;
        admin_name: string;
        email: string;
        phone: string;
        password_hash: string;
        verification_code: string;
        expires_at: string | Date;
        verified_at: string | Date | null;
        provisioned_tenant_id: string | null;
      }>;

      const reg = rows[0];
      if (!reg) {
        throw new DomainValidationError('Solicitação de credenciamento não encontrada. Inicie o cadastro novamente.');
      }
      if (reg.verified_at && reg.provisioned_tenant_id) {
        return {
          alreadyProvisioned: true,
          tenantId: reg.provisioned_tenant_id,
          email: reg.email,
          companyName: reg.company_name,
        };
      }
      if (reg.verification_code !== code) {
        throw new DomainValidationError('Código de confirmação incorreto. Confira os 6 dígitos enviados ao seu e-mail.');
      }
      if (new Date(reg.expires_at).getTime() < Date.now()) {
        throw new DomainValidationError('Este código expirou (validade de 15 minutos). Solicite um novo código.');
      }

      const actorUserId = randomUUID();
      const tenantCode = this.generateTenantCode(reg.company_name);

      const { tenant, company } = await this.tenantProvisioningService.provisionNewAccount({
        code: tenantCode,
        legalName: reg.company_name,
        displayName: reg.company_name,
        cnpj: reg.cnpj || null,
        actorUserId,
      });

      const branches = await this.branchService.listByTenant(tenant.id);
      const defaultBranch = branches[0];
      const defaultBranchId = defaultBranch?.id ?? null;

      await this.dataSource.query(
        `INSERT INTO user_identities (
           id, tenant_id, default_branch_id, email, display_name, status,
           is_deleted, created_by, updated_by
         )
         VALUES ($1, $2, $3, $4, $5, 'active', false, $1, $1)`,
        [actorUserId, tenant.id, defaultBranchId, reg.email, reg.admin_name],
      );

      await this.dataSource.query(
        `INSERT INTO user_credentials (
           id, tenant_id, user_id, password_hash, password_algorithm,
           password_updated_at, must_rotate_password, created_by, updated_by
         )
         VALUES ($1, $2, $3, $4, 'scrypt', now(), false, $3, $3)`,
        [randomUUID(), tenant.id, actorUserId, reg.password_hash],
      );

      const managerRole = await this.roleRepository.findByTenantAndCode(tenant.id, 'GERENTE');
      if (managerRole) {
        await this.userRoleAssignmentRepository.save(
          this.userRoleAssignmentRepository.create({
            id: randomUUID(),
            tenantId: tenant.id,
            userId: actorUserId,
            roleId: managerRole.id,
            assignedBranchId: defaultBranchId,
            grantsAllBranches: true,
            assignedAt: new Date(),
            revokedAt: null,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          }),
        );
      }

      if (defaultBranchId) {
        await this.userBranchScopeRepository.save(
          this.userBranchScopeRepository.create({
            id: randomUUID(),
            tenantId: tenant.id,
            userId: actorUserId,
            branchId: defaultBranchId,
            scopeType: BranchScopeType.ADMIN,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          }),
        );
      }

      await this.dataSource.query(
        `UPDATE onboarding_registrations
            SET verified_at = now(),
                provisioned_tenant_id = $2
          WHERE id = $1`,
        [reg.id, tenant.id],
      );

      return {
        alreadyProvisioned: false,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        companyId: company.id,
        companyName: company.legalName,
        email: reg.email,
      };
    });
  }

  private generateTenantCode(companyName: string): string {
    const cleanPrefix = companyName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'ANX';
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `${cleanPrefix}-${suffix}`;
  }

  private async trySendVerificationEmail(input: {
    to: string;
    adminName: string;
    companyName: string;
    code: string;
  }): Promise<{ sent: boolean }> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT host, port, security, username, password, from_name, from_address
           FROM email_settings
          WHERE host <> '' AND username <> '' AND password <> '' AND from_address <> ''
          ORDER BY updated_at DESC
          LIMIT 1`,
      )) as Array<{
        host: string;
        port: number;
        security: SmtpSecurity;
        username: string;
        password: string;
        from_name: string;
        from_address: string;
      }>;
      const smtp = rows[0];
      if (!smtp) {
        return { sent: false };
      }
      await sendSmtpMessage({
        host: smtp.host,
        port: Number(smtp.port || 587),
        security: smtp.security || 'starttls',
        username: smtp.username,
        password: smtp.password,
        fromName: smtp.from_name || 'ANEXSYS',
        fromAddress: smtp.from_address,
        to: input.to,
        subject: `Código de confirmação ANEXSYS: ${input.code}`,
        text: [
          `Olá, ${input.adminName}!`,
          '',
          `Use o código abaixo para confirmar a criação da sua conta "${input.companyName}" na plataforma ANEXSYS:`,
          '',
          `CÓDIGO: ${input.code}`,
          '',
          'Este código vale por 15 minutos.',
        ].join('\n'),
      });
      return { sent: true };
    } catch {
      return { sent: false };
    }
  }
}
