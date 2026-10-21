import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { PasswordHasherService } from 'src/platform/auth/password-hasher.service';
import { SessionStatus, UserStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { EntityNotFoundError } from 'src/shared/errors/entity-not-found.error';
import { CreateUserDto } from '../../contracts/dto/create-user.dto';
import { FirstAccessTokenEntity } from '../../infrastructure/persistence/entities/first-access-token.entity';
import { UserContextPreferenceEntity } from '../../infrastructure/persistence/entities/user-context-preference.entity';
import { UserCredentialEntity } from '../../infrastructure/persistence/entities/user-credential.entity';
import { UserIdentityEntity } from '../../infrastructure/persistence/entities/user-identity.entity';
import { UserSessionEntity } from '../../infrastructure/persistence/entities/user-session.entity';
import { UserContextPreferenceRepository } from '../../infrastructure/persistence/repositories/user-context-preference.repository';
import { UserCredentialRepository } from '../../infrastructure/persistence/repositories/user-credential.repository';
import { UserIdentityRepository } from '../../infrastructure/persistence/repositories/user-identity.repository';

export interface InviteUserDto {
  tenantId: string;
  defaultBranchId?: string;
  email: string;
  displayName: string;
  actorUserId: string;
}

export interface UpdateUserDto {
  email?: string;
  displayName?: string;
  defaultBranchId?: string | null;
  status?: UserStatus;
  actorUserId: string;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(UserIdentityRepository)
    private readonly userIdentityRepository: UserIdentityRepository,
    @Inject(UserCredentialRepository)
    private readonly userCredentialRepository: UserCredentialRepository,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(PasswordHasherService)
    private readonly passwordHasherService: PasswordHasherService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(UserContextPreferenceRepository)
    private readonly userContextPreferenceRepository: UserContextPreferenceRepository,
  ) {}

  async createUser(dto: CreateUserDto): Promise<UserIdentityEntity> {
    await this.assertTenantBranchConsistency(dto.tenantId, dto.defaultBranchId);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userIdentityRepository.findByTenantAndEmail(dto.tenantId, normalizedEmail);
    if (existing) {
      throw new DomainValidationError(`User email '${normalizedEmail}' already exists for this tenant.`);
    }

    const userId = randomUUID();
    const user = this.userIdentityRepository.create({
      id: userId,
      tenantId: dto.tenantId,
      defaultBranchId: dto.defaultBranchId ?? null,
      email: normalizedEmail,
      displayName: dto.displayName.trim(),
      status: UserStatus.ACTIVE,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });
    const passwordHash = await this.passwordHasherService.hash(dto.password);
    const credential = this.userCredentialRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      userId,
      passwordHash,
      passwordAlgorithm: 'scrypt',
      passwordUpdatedAt: new Date(),
      mustRotatePassword: false,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const savedUser = await this.dataSource.transaction(async (manager) => {
      const persistedUser = manager.create(UserIdentityEntity, user);
      const persistedCredential = manager.create(UserCredentialEntity, credential);
      await manager.save(UserIdentityEntity, persistedUser);
      await manager.save(UserCredentialEntity, persistedCredential);
      return persistedUser;
    });
    await this.auditService.record({
      tenantId: savedUser.tenantId,
      branchId: savedUser.defaultBranchId,
      actorUserId: dto.actorUserId,
      entityType: 'user_identity',
      entityId: savedUser.id,
      action: 'identity.user.created',
      eventType: 'identity.write',
      metadata: { email: savedUser.email },
    });

    return savedUser;
  }

  async inviteUser(dto: InviteUserDto): Promise<UserIdentityEntity> {
    await this.assertTenantBranchConsistency(dto.tenantId, dto.defaultBranchId);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userIdentityRepository.findByTenantAndEmail(dto.tenantId, normalizedEmail);
    if (existing) {
      throw new DomainValidationError(`User email '${normalizedEmail}' already exists for this tenant.`);
    }

    const user = this.userIdentityRepository.create({
      id: randomUUID(),
      tenantId: dto.tenantId,
      defaultBranchId: dto.defaultBranchId ?? null,
      email: normalizedEmail,
      displayName: dto.displayName.trim(),
      status: UserStatus.INVITED,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdBy: dto.actorUserId,
      updatedBy: dto.actorUserId,
    });

    const savedUser = await this.userIdentityRepository.save(user);
    await this.auditService.record({
      tenantId: savedUser.tenantId,
      branchId: savedUser.defaultBranchId,
      actorUserId: dto.actorUserId,
      entityType: 'user_identity',
      entityId: savedUser.id,
      action: 'identity.user.invited',
      eventType: 'identity.write',
      metadata: { email: savedUser.email },
    });

    return savedUser;
  }

  async setPassword(params: {
    tenantId: string;
    userId: string;
    password: string;
    actorUserId: string;
    mustRotatePassword?: boolean;
    activateUser?: boolean;
  }): Promise<UserIdentityEntity> {
    const user = await this.getById(params.userId);
    if (user.tenantId !== params.tenantId) {
      throw new DomainValidationError('User is outside the tenant scope.');
    }

    const existingCredential = await this.userCredentialRepository.findByUserId(user.id);
    const passwordHash = await this.passwordHasherService.hash(params.password);
    const now = new Date();

    const savedUser = await this.dataSource.transaction(async (manager) => {
      const nextUser = manager.create(UserIdentityEntity, {
        ...user,
        status: params.activateUser ? UserStatus.ACTIVE : user.status,
        updatedBy: params.actorUserId,
      });

      const credential = existingCredential
        ? manager.create(UserCredentialEntity, {
            ...existingCredential,
            passwordHash,
            passwordUpdatedAt: now,
            mustRotatePassword: params.mustRotatePassword ?? false,
            updatedBy: params.actorUserId,
          })
        : manager.create(UserCredentialEntity, {
            id: randomUUID(),
            tenantId: user.tenantId,
            userId: user.id,
            passwordHash,
            passwordAlgorithm: 'scrypt',
            passwordUpdatedAt: now,
            mustRotatePassword: params.mustRotatePassword ?? false,
            createdBy: params.actorUserId,
            updatedBy: params.actorUserId,
          });

      await manager.save(UserIdentityEntity, nextUser);
      await manager.save(UserCredentialEntity, credential);
      return nextUser;
    });

    await this.auditService.record({
      tenantId: savedUser.tenantId,
      branchId: savedUser.defaultBranchId,
      actorUserId: params.actorUserId,
      entityType: 'user_identity',
      entityId: savedUser.id,
      action: 'identity.password.updated',
      eventType: 'identity.write',
      metadata: { activated: params.activateUser ?? false },
    });

    return savedUser;
  }

  async getById(id: string): Promise<UserIdentityEntity> {
    const user = await this.userIdentityRepository.findById(id);
    if (!user) {
      throw new EntityNotFoundError(`User '${id}' was not found.`);
    }

    return user;
  }

  async getByTenantAndEmail(tenantId: string, email: string): Promise<UserIdentityEntity | null> {
    return this.userIdentityRepository.findByTenantAndEmail(tenantId, email);
  }

  async listByEmail(email: string): Promise<UserIdentityEntity[]> {
    return this.userIdentityRepository.findByEmail(email.trim().toLowerCase());
  }

  async listActiveByEmail(email: string): Promise<UserIdentityEntity[]> {
    return this.userIdentityRepository.findActiveByEmail(email.trim().toLowerCase());
  }

  async listByTenant(tenantId: string): Promise<UserIdentityEntity[]> {
    await this.tenantService.getById(tenantId);
    const users = await this.userIdentityRepository.findByTenant(tenantId);
    const masterIds = await this.masterUserIds(tenantId);
    return users.map((user) => Object.assign(user, { isMaster: masterIds.has(user.id) }));
  }

  async userIsMaster(tenantId: string, userId: string): Promise<boolean> {
    const ids = await this.masterUserIds(tenantId, userId);
    return ids.has(userId);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<UserIdentityEntity> {
    const user = await this.getById(id);
    if (await this.userIsMaster(user.tenantId, user.id)) {
      throw new DomainValidationError('O master só altera a senha.');
    }
    await this.assertTenantBranchConsistency(user.tenantId, dto.defaultBranchId === undefined ? user.defaultBranchId ?? undefined : dto.defaultBranchId ?? undefined);

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existing = await this.userIdentityRepository.findByTenantAndEmail(user.tenantId, normalizedEmail);
        if (existing && existing.id !== user.id) {
          throw new DomainValidationError(`User email '${normalizedEmail}' already exists for this tenant.`);
        }
        user.email = normalizedEmail;
      }
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName.trim();
    }
    if (dto.defaultBranchId !== undefined) {
      user.defaultBranchId = dto.defaultBranchId;
    }
    if (dto.status !== undefined) {
      user.status = dto.status;
    }
    user.updatedBy = dto.actorUserId;

    const saved = await this.userIdentityRepository.save(user);
    await this.auditService.record({
      tenantId: saved.tenantId,
      branchId: saved.defaultBranchId,
      actorUserId: dto.actorUserId,
      entityType: 'user_identity',
      entityId: saved.id,
      action: 'identity.user.updated',
      eventType: 'identity.write',
      metadata: {
        email: saved.email,
        status: saved.status,
        defaultBranchId: saved.defaultBranchId,
      },
    });

    return saved;
  }

  async removeUser(id: string, tenantId: string, actorUserId: string): Promise<void> {
    const user = await this.getById(id);
    if (user.tenantId !== tenantId) {
      throw new DomainValidationError('O usuário está fora do contexto da Conta.');
    }
    if (user.id === actorUserId) {
      throw new DomainValidationError('Você não pode excluir o próprio usuário.');
    }
    if (await this.userIsMaster(tenantId, user.id)) {
      throw new DomainValidationError('O master não pode ser excluído.');
    }
    if (await this.hasBusinessMovement(tenantId, user.id)) {
      throw new DomainValidationError('Este usuário já tem movimento no ateliê. Use Inativar. O cadastro permanece e o acesso é bloqueado.');
    }

    const liveCount = await this.userIdentityRepository.countLiveByTenant(tenantId);
    if (liveCount <= 1) {
      throw new DomainValidationError('Não é possível excluir o último usuário da Conta.');
    }

    const now = new Date();
    user.isDeleted = true;
    user.deletedAt = now;
    user.deletedBy = actorUserId;
    user.updatedBy = actorUserId;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(UserIdentityEntity, user);
      await manager.update(
        UserSessionEntity,
        { userId: user.id, status: SessionStatus.ACTIVE },
        { status: SessionStatus.REVOKED, revokedAt: now, updatedAt: now, updatedBy: actorUserId },
      );
      await manager
        .createQueryBuilder()
        .update(FirstAccessTokenEntity)
        .set({ revokedAt: now, updatedAt: now, updatedBy: actorUserId })
        .where('user_id = :userId', { userId: user.id })
        .andWhere('revoked_at IS NULL')
        .execute();
    });

    await this.auditService.record({
      tenantId,
      branchId: user.defaultBranchId,
      actorUserId,
      entityType: 'user_identity',
      entityId: user.id,
      action: 'identity.user.deleted',
      eventType: 'identity.write',
      metadata: { email: user.email },
    });
  }

  async getContextPreference(normalizedEmail: string): Promise<UserContextPreferenceEntity | null> {
    return this.userContextPreferenceRepository.findByEmail(normalizedEmail.trim().toLowerCase());
  }

  async saveContextPreference(params: {
    normalizedEmail: string;
    lastTenantId: string | null;
    lastBranchId: string | null;
    actorUserId: string;
  }): Promise<UserContextPreferenceEntity> {
    const normalizedEmail = params.normalizedEmail.trim().toLowerCase();
    const existing = await this.userContextPreferenceRepository.findByEmail(normalizedEmail);
    const now = new Date();
    const preference = existing
      ? this.userContextPreferenceRepository.create({
          ...existing,
          lastTenantId: params.lastTenantId,
          lastBranchId: params.lastBranchId,
          updatedAt: now,
          updatedBy: params.actorUserId,
        })
      : this.userContextPreferenceRepository.create({
          normalizedEmail,
          lastTenantId: params.lastTenantId,
          lastBranchId: params.lastBranchId,
          createdAt: now,
          createdBy: params.actorUserId,
          updatedAt: now,
          updatedBy: params.actorUserId,
        });

    return this.userContextPreferenceRepository.save(preference);
  }

  private async masterUserIds(tenantId: string, userId?: string): Promise<Set<string>> {
    const rows = await this.dataSource.query(
      `
        SELECT a.user_id
        FROM user_role_assignments a
        JOIN roles r ON r.id = a.role_id
        WHERE a.tenant_id = $1
          AND a.revoked_at IS NULL
          AND upper(r.code) = 'MASTER_ADMINISTRATOR'
          AND ($2::uuid IS NULL OR a.user_id = $2::uuid)
      `,
      [tenantId, userId ?? null],
    );
    return new Set(rows.map((row: { user_id: string }) => row.user_id));
  }

  private async hasBusinessMovement(tenantId: string, userId: string): Promise<boolean> {
    const checks = [
      `SELECT 1 FROM service_orders WHERE tenant_id = $1 AND is_deleted = false AND (created_by = $2 OR commercial_responsible_actor_id = $2 OR technical_measurement_responsible_actor_id = $2) LIMIT 1`,
      `SELECT 1 FROM payment_records WHERE tenant_id = $1 AND created_by = $2 LIMIT 1`,
      `SELECT 1 FROM quality_records WHERE tenant_id = $1 AND (created_by = $2 OR quality_responsible_actor_id = $2) LIMIT 1`,
      `SELECT 1 FROM floor_diary_entries WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      `SELECT 1 FROM floor_schedule_days d JOIN floor_technicians t ON t.id = d.technician_id WHERE d.tenant_id = $1 AND t.user_id = $2 LIMIT 1`,
    ];
    for (const sql of checks) {
      const rows = await this.dataSource.query(sql, [tenantId, userId]);
      if (rows.length > 0) {
        return true;
      }
    }
    return false;
  }

  private async assertTenantBranchConsistency(tenantId: string, defaultBranchId?: string) {
    await this.tenantService.getById(tenantId);
    if (defaultBranchId) {
      const branch = await this.branchService.getById(defaultBranchId);
      if (branch.tenantId !== tenantId) {
        throw new DomainValidationError('Default branch must belong to the same tenant as the user.');
      }
    }
  }
}
