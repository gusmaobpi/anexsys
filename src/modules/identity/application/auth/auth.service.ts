import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from 'src/modules/audit/application/audit/audit.service';
import { AuthorizationService, EffectiveAccessResult } from 'src/modules/authorization/application/authorization/authorization.service';
import { BranchService } from 'src/modules/branch/application/branch/branch.service';
import { TenantService } from 'src/modules/tenant/application/tenant/tenant.service';
import { TokenFactoryService } from 'src/platform/auth/token-factory.service';
import { PasswordHasherService } from 'src/platform/auth/password-hasher.service';
import { AuthenticationFailedError } from 'src/shared/errors/authentication-failed.error';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { LoginPasswordDto } from '../../contracts/dto/login-password.dto';
import { LogoutDto } from '../../contracts/dto/logout.dto';
import { RefreshTokenDto } from '../../contracts/dto/refresh-token.dto';
import { UserStatus, SessionStatus } from 'src/shared/domain/enums';
import { FirstAccessTokenEntity } from '../../infrastructure/persistence/entities/first-access-token.entity';
import { UserSessionEntity } from '../../infrastructure/persistence/entities/user-session.entity';
import { FirstAccessTokenRepository } from '../../infrastructure/persistence/repositories/first-access-token.repository';
import { EmailSettingsService } from 'src/modules/email/application/email-settings.service';
import { UserCredentialRepository } from '../../infrastructure/persistence/repositories/user-credential.repository';
import { UserSessionRepository } from '../../infrastructure/persistence/repositories/user-session.repository';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { IdentityService } from '../identity/identity.service';

type AvailableCompany = {
  tenantId: string;
  userId: string;
  code: string;
  displayName: string;
  defaultBranchId: string | null;
};

type SessionContextData = {
  availableCompanies: AvailableCompany[];
  companySelectionRequired: boolean;
};

type SessionContextResponse = {
  availableCompanies: AvailableCompany[];
  companySelectionRequired: boolean;
  lastBranchId: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(UserCredentialRepository)
    private readonly userCredentialRepository: UserCredentialRepository,
    @Inject(UserSessionRepository)
    private readonly userSessionRepository: UserSessionRepository,
    @Inject(AuthorizationService)
    private readonly authorizationService: AuthorizationService,
    @Inject(PasswordHasherService)
    private readonly passwordHasherService: PasswordHasherService,
    @Inject(TokenFactoryService)
    private readonly tokenFactoryService: TokenFactoryService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(TenantService)
    private readonly tenantService: TenantService,
    @Inject(BranchService)
    private readonly branchService: BranchService,
    @Inject(FirstAccessTokenRepository)
    private readonly firstAccessTokenRepository: FirstAccessTokenRepository,
    @Inject(EmailSettingsService)
    private readonly emailSettingsService: EmailSettingsService,
  ) {}

  private readonly resetHits = new Map<string, number[]>();

  async loginWithPassword(dto: LoginPasswordDto): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    tenantId: string;
    branchIds: string[];
    permissions: string[];
  }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const password = dto.password;
    const candidates = await this.identityService.listActiveByEmail(normalizedEmail);
    if (candidates.length === 0) {
      await this.recordLoginFailure(normalizedEmail);
      throw new AuthenticationFailedError();
    }

    const credentials = await this.userCredentialRepository.findByUserIds(candidates.map((candidate) => candidate.id));
    const credentialByUserId = new Map(credentials.map((credential) => [credential.userId, credential]));

    const matchingUsers: typeof candidates = [];
    for (const candidate of candidates) {
      const credential = credentialByUserId.get(candidate.id);
      if (!credential) continue;
      const valid = await this.passwordHasherService.verify(password, credential.passwordHash);
      if (valid) {
        matchingUsers.push(candidate);
      }
    }

    if (matchingUsers.length === 0) {
      await this.recordLoginFailure(normalizedEmail, candidates[0]?.id ?? null, candidates[0]?.tenantId ?? null);
      throw new AuthenticationFailedError();
    }

    const preference = await this.identityService.getContextPreference(normalizedEmail);
    const availableCompanies = await this.buildAvailableCompanies(matchingUsers);
    const activeCompany = this.resolveActiveCompany(availableCompanies, preference?.lastTenantId ?? null);
    if (!activeCompany) {
      await this.recordLoginFailure(normalizedEmail, matchingUsers[0]?.id ?? null, matchingUsers[0]?.tenantId ?? null);
      throw new AuthenticationFailedError();
    }

    const effectiveAccess = await this.authorizationService.getEffectiveAccessForUser(activeCompany.tenantId, activeCompany.userId);
    const restoredBranchId =
      availableCompanies.length === 1
        ? this.resolveRestoredBranchId(
            preference?.lastTenantId === activeCompany.tenantId ? preference.lastBranchId ?? null : null,
            activeCompany.defaultBranchId,
            effectiveAccess.branchIds,
          )
        : null;
    const session = await this.createSession({
      loginEmail: normalizedEmail,
      activeCompany,
      effectiveAccess,
      availableCompanies,
      companySelectionRequired: availableCompanies.length > 1 && preference?.lastTenantId !== activeCompany.tenantId,
    });

    if (availableCompanies.length === 1) {
      await this.identityService.saveContextPreference({
        normalizedEmail,
        lastTenantId: activeCompany.tenantId,
        lastBranchId: restoredBranchId,
        actorUserId: activeCompany.userId,
      });
    }

    await this.auditService.record({
      tenantId: activeCompany.tenantId,
      branchId: activeCompany.defaultBranchId,
      actorUserId: activeCompany.userId,
      entityType: 'session',
      entityId: session.id,
      action: 'auth.login.succeeded',
      eventType: 'authentication.succeeded',
      metadata: { email: normalizedEmail, companyCount: availableCompanies.length },
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.id,
      tenantId: activeCompany.tenantId,
      branchIds: effectiveAccess.branchIds,
      permissions: effectiveAccess.permissions,
    };
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string; sessionId: string; tenantId: string }> {
    let payload;
    try {
      payload = await this.tokenFactoryService.verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new AuthenticationFailedError('Refresh token is invalid.');
    }

    if (payload.tokenType !== 'refresh') {
      throw new AuthenticationFailedError('Refresh token is invalid.');
    }
    const session = await this.userSessionRepository.findActiveById(payload.jti);
    if (!session) {
      throw new AuthenticationFailedError('Refresh token is not active.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeRefreshSession(session, payload.sub);
      throw new AuthenticationFailedError('Refresh token is not active.');
    }

    if (session.userId !== payload.sub || session.tenantId !== payload.tenantId) {
      throw new AuthenticationFailedError('Refresh token session mismatch.');
    }

    if (!this.tokenFactoryService.compareTokenHash(dto.refreshToken, session.refreshTokenHash)) {
      const rotatedAt = session.lastUsedAt?.getTime() ?? 0;
      const rotatedJustNow = Date.now() - rotatedAt < 30_000;
      if (!rotatedJustNow) {
        await this.revokeRefreshSession(session, payload.sub);
      }
      throw new AuthenticationFailedError('Refresh token is invalid.');
    }

    const user = await this.identityService.getById(payload.sub);
    if (user.tenantId !== payload.tenantId || user.status !== UserStatus.ACTIVE) {
      await this.revokeRefreshSession(session, payload.sub);
      throw new AuthenticationFailedError('Refresh token is not active.');
    }

    const effectiveAccess = await this.authorizationService.getEffectiveAccessForUser(payload.tenantId, payload.sub);
    const issuedTokens = await this.tokenFactoryService.issueTokens(
      {
        sub: payload.sub,
        tenantId: payload.tenantId,
        branchIds: effectiveAccess.branchIds,
        permissions: effectiveAccess.permissions,
      },
      session.id,
    );

    const rotated = await this.userSessionRepository.rotateRefreshToken({
      sessionId: session.id,
      expectedRefreshTokenHash: session.refreshTokenHash,
      refreshTokenHash: issuedTokens.refreshTokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updatedBy: payload.sub,
    });
    if (!rotated) {
      throw new AuthenticationFailedError('Refresh token is not active.');
    }

    session.refreshTokenHash = issuedTokens.refreshTokenHash;
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.updatedAt = new Date();
    session.updatedBy = payload.sub;

    return {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      sessionId: session.id,
      tenantId: payload.tenantId,
    };
  }

  async issueFirstAccessToken(params: {
    tenantId: string;
    userId: string;
    actorUserId: string;
    email: string;
    deliveryChannel?: string | null;
    expiresInHours?: number;
  }): Promise<{ token: string; expiresAt: string }> {
    const user = await this.identityService.getById(params.userId);
    if (user.tenantId !== params.tenantId) {
      throw new DomainValidationError('User is outside the tenant scope.');
    }

    await this.firstAccessTokenRepository.revokeActiveByUserId(user.id, params.actorUserId);

    const rawToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + (params.expiresInHours ?? 72) * 60 * 60 * 1000);
    const token = this.firstAccessTokenRepository.create({
      id: randomUUID(),
      tenantId: params.tenantId,
      userId: user.id,
      tokenHash: this.tokenFactoryService.hashToken(rawToken),
      deliveryChannel: params.deliveryChannel ?? null,
      issuedAt,
      expiresAt,
      consumedAt: null,
      revokedAt: null,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    });

    await this.firstAccessTokenRepository.save(token);
    await this.auditService.record({
      tenantId: params.tenantId,
      branchId: user.defaultBranchId,
      actorUserId: params.actorUserId,
      entityType: 'first_access_token',
      entityId: token.id,
      action: 'auth.first_access.issued',
      eventType: 'authentication.write',
      metadata: { email: params.email, deliveryChannel: params.deliveryChannel ?? null },
    });

    return { token: rawToken, expiresAt: expiresAt.toISOString() };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const message = this.emailSettingsService.passwordResetMessage();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !this.allowReset(normalized)) {
      return { message };
    }
    const users = await this.identityService.listByEmail(normalized);
    for (const user of users) {
      if (user.isDeleted || user.status === UserStatus.INACTIVE) {
        continue;
      }
      if (!(await this.emailSettingsService.canEmailLinks(user.tenantId))) {
        continue;
      }
      try {
        const issued = await this.issueFirstAccessToken({
          tenantId: user.tenantId,
          userId: user.id,
          actorUserId: user.id,
          email: user.email,
          deliveryChannel: 'email',
        });
        await this.emailSettingsService.trySendAccessLink({
          tenantId: user.tenantId,
          to: user.email,
          displayName: user.displayName,
          token: issued.token,
          purpose: 'reset',
        });
      } catch {
        // A resposta não muda se o envio falhar.
      }
    }
    return { message };
  }

  private allowReset(email: string): boolean {
    const now = Date.now();
    const recent = (this.resetHits.get(email) ?? []).filter((at) => now - at < 15 * 60 * 1000);
    if (recent.length >= 5) {
      this.resetHits.set(email, recent);
      return false;
    }
    recent.push(now);
    this.resetHits.set(email, recent);
    return true;
  }

  async validateFirstAccessToken(params: { email: string; token: string }) {
    const resolved = await this.resolveFirstAccessToken(params.email, params.token);
    const tenant = await this.tenantService.getById(resolved.user.tenantId);

    return {
      valid: true,
      expiresAt: resolved.token.expiresAt.toISOString(),
      user: {
        id: resolved.user.id,
        email: resolved.user.email,
        displayName: resolved.user.displayName,
      },
      company: {
        tenantId: tenant.id,
        displayName: tenant.displayName,
        code: tenant.code,
      },
    };
  }

  async completeFirstAccess(params: { email: string; token: string; password: string }) {
    const resolved = await this.resolveFirstAccessToken(params.email, params.token);
    const updatedUser = await this.identityService.setPassword({
      tenantId: resolved.user.tenantId,
      userId: resolved.user.id,
      password: params.password,
      actorUserId: resolved.user.id,
      activateUser: true,
      mustRotatePassword: false,
    });

    resolved.token.consumedAt = new Date();
    resolved.token.updatedAt = new Date();
    resolved.token.updatedBy = resolved.user.id;
    await this.firstAccessTokenRepository.save(resolved.token);
    await this.auditService.record({
      tenantId: resolved.user.tenantId,
      branchId: updatedUser.defaultBranchId,
      actorUserId: resolved.user.id,
      entityType: 'first_access_token',
      entityId: resolved.token.id,
      action: 'auth.first_access.completed',
      eventType: 'authentication.succeeded',
      metadata: { email: resolved.user.email },
    });

    return { success: true };
  }

  async selectCompany(params: {
    sessionId: string;
    actorUserId: string;
    tenantId: string;
  }): Promise<{ accessToken: string; refreshToken: string; sessionId: string; tenantId: string; branchIds: string[]; permissions: string[] }> {
    return TenantContext.run({ tenantId: null, bypass: true }, async () => {
    const session = await this.userSessionRepository.findActiveById(params.sessionId);
    if (!session || session.userId !== params.actorUserId) {
      throw new AuthenticationFailedError('Session revocation is not allowed.');
    }

    const context = this.parseSessionContext(session.contextData);
    const company = context.availableCompanies.find((candidate) => candidate.tenantId === params.tenantId);
    if (!company) {
      throw new DomainValidationError('Requested company is outside the authenticated access scope.');
    }

    const user = await this.identityService.getById(company.userId);
    if (user.status !== UserStatus.ACTIVE || user.tenantId !== company.tenantId) {
      throw new AuthenticationFailedError('Requested company is not active.');
    }

    const effectiveAccess = await this.authorizationService.getEffectiveAccessForUser(company.tenantId, company.userId);
    const issuedTokens = await this.tokenFactoryService.issueTokens(
      {
        sub: user.id,
        tenantId: user.tenantId,
        branchIds: effectiveAccess.branchIds,
        permissions: effectiveAccess.permissions,
      },
      session.id,
    );

    session.userId = user.id;
    session.tenantId = user.tenantId;
    session.loginEmail = user.email;
    session.contextData = {
      ...context,
      companySelectionRequired: false,
    };
    session.refreshTokenHash = issuedTokens.refreshTokenHash;
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.updatedAt = new Date();
    session.updatedBy = user.id;
    await this.userSessionRepository.save(session);

    await this.identityService.saveContextPreference({
      normalizedEmail: user.email,
      lastTenantId: user.tenantId,
      lastBranchId: null,
      actorUserId: user.id,
    });

    await this.auditService.record({
      tenantId: user.tenantId,
      branchId: user.defaultBranchId,
      actorUserId: user.id,
      entityType: 'session',
      entityId: session.id,
      action: 'auth.context.company.selected',
      eventType: 'authentication.write',
      metadata: { companyCount: context.availableCompanies.length },
    });

    return {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      sessionId: session.id,
      tenantId: user.tenantId,
      branchIds: effectiveAccess.branchIds,
      permissions: effectiveAccess.permissions,
    };
    });
  }

  async selectBranch(params: { sessionId: string; actorUserId: string; branchId: string }): Promise<void> {
    const session = await this.userSessionRepository.findActiveById(params.sessionId);
    if (!session || session.userId !== params.actorUserId) {
      throw new AuthenticationFailedError('Session revocation is not allowed.');
    }

    const effectiveAccess = await this.authorizationService.getEffectiveAccessForUser(session.tenantId, session.userId);
    if (!effectiveAccess.branchIds.includes(params.branchId)) {
      throw new DomainValidationError('Requested branch is outside the authenticated access scope.');
    }

    const branch = await this.branchService.getById(params.branchId);
    if (branch.tenantId !== session.tenantId) {
      throw new DomainValidationError('Requested branch is outside the authenticated tenant scope.');
    }

    const user = await this.identityService.getById(session.userId);
    await this.identityService.saveContextPreference({
      normalizedEmail: user.email,
      lastTenantId: session.tenantId,
      lastBranchId: params.branchId,
      actorUserId: session.userId,
    });

    await this.auditService.record({
      tenantId: session.tenantId,
      branchId: params.branchId,
      actorUserId: session.userId,
      entityType: 'session',
      entityId: session.id,
      action: 'auth.context.branch.selected',
      eventType: 'authentication.write',
      metadata: {},
    });
  }

  async getSessionContext(sessionId: string, actorUserId: string): Promise<SessionContextResponse> {
    const session = await this.userSessionRepository.findActiveById(sessionId);
    if (!session || session.userId !== actorUserId) {
      throw new AuthenticationFailedError('Authenticated session is required.');
    }

    const user = await this.identityService.getById(actorUserId);
    const preference = await this.identityService.getContextPreference(user.email);
    const lastBranchId = preference?.lastTenantId === session.tenantId ? preference.lastBranchId ?? null : null;

    return {
      ...this.parseSessionContext(session.contextData),
      lastBranchId,
    };
  }

  async logout(dto: LogoutDto): Promise<void> {
    const session = await this.userSessionRepository.findActiveById(dto.sessionId);
    if (!session) {
      return;
    }

    if (session.userId !== dto.actorUserId) {
      throw new AuthenticationFailedError('Session revocation is not allowed.');
    }

    session.status = SessionStatus.REVOKED;
    session.revokedAt = new Date();
    session.updatedAt = new Date();
    session.updatedBy = dto.actorUserId;
    await this.userSessionRepository.save(session);
    await this.auditService.record({
      tenantId: session.tenantId,
      actorUserId: dto.actorUserId,
      entityType: 'session',
      entityId: session.id,
      action: 'auth.logout',
      eventType: 'authentication.logout',
    });
  }

  private async resolveFirstAccessToken(email: string, rawToken: string): Promise<{
    token: FirstAccessTokenEntity;
    user: Awaited<ReturnType<IdentityService['getById']>>;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const token = await this.firstAccessTokenRepository.findActiveByTokenHash(this.tokenFactoryService.hashToken(rawToken));
    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new AuthenticationFailedError('First access token is invalid or expired.');
    }

    const user = await this.identityService.getById(token.userId);
    if (user.email !== normalizedEmail) {
      throw new AuthenticationFailedError('First access token is invalid or expired.');
    }

    return { token, user };
  }

  private async createSession(params: {
    loginEmail: string;
    activeCompany: AvailableCompany;
    effectiveAccess: EffectiveAccessResult;
    availableCompanies: AvailableCompany[];
    companySelectionRequired: boolean;
  }): Promise<UserSessionEntity & { accessToken: string; refreshToken: string }> {
    const issuedTokens = await this.tokenFactoryService.issueTokens({
      sub: params.activeCompany.userId,
      tenantId: params.activeCompany.tenantId,
      branchIds: params.effectiveAccess.branchIds,
      permissions: params.effectiveAccess.permissions,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const session = this.userSessionRepository.create({
      id: issuedTokens.refreshTokenId,
      tenantId: params.activeCompany.tenantId,
      userId: params.activeCompany.userId,
      refreshTokenHash: issuedTokens.refreshTokenHash,
      status: SessionStatus.ACTIVE,
      issuedAt: now,
      expiresAt,
      lastUsedAt: now,
      revokedAt: null,
      loginEmail: params.loginEmail,
      contextData: {
        availableCompanies: params.availableCompanies,
        companySelectionRequired: params.companySelectionRequired,
      },
      createdAt: now,
      createdBy: params.activeCompany.userId,
      updatedAt: now,
      updatedBy: params.activeCompany.userId,
    });

    await this.userSessionRepository.save(session);
    return Object.assign(session, {
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
    });
  }

  private async buildAvailableCompanies(users: Awaited<ReturnType<IdentityService['listActiveByEmail']>>): Promise<AvailableCompany[]> {
    const companies = await Promise.all(
      users.map(async (user) => {
        const tenant = await this.tenantService.getById(user.tenantId);
        return {
          tenantId: tenant.id,
          userId: user.id,
          code: tenant.code,
          displayName: tenant.displayName,
          defaultBranchId: user.defaultBranchId,
        } satisfies AvailableCompany;
      }),
    );

    return companies.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private resolveActiveCompany(companies: AvailableCompany[], preferredTenantId: string | null): AvailableCompany | null {
    if (companies.length === 0) return null;
    if (preferredTenantId) {
      const preferred = companies.find((company) => company.tenantId === preferredTenantId);
      if (preferred) return preferred;
    }
    return companies[0] ?? null;
  }

  private resolveRestoredBranchId(
    preferredBranchId: string | null,
    defaultBranchId: string | null,
    effectiveBranchIds: string[],
  ): string | null {
    const allowed = new Set(effectiveBranchIds);
    const candidates = [preferredBranchId, defaultBranchId].filter((value): value is string => Boolean(value));
    for (const branchId of candidates) {
      if (allowed.has(branchId)) {
        return branchId;
      }
    }

    return effectiveBranchIds[0] ?? null;
  }

  private parseSessionContext(input: Record<string, unknown> | null | undefined): SessionContextData {
    const rawCompanies = Array.isArray(input?.availableCompanies) ? input?.availableCompanies : [];
    const availableCompanies = rawCompanies
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .filter(
        (item): item is AvailableCompany =>
          typeof item.tenantId === 'string' &&
          typeof item.userId === 'string' &&
          typeof item.code === 'string' &&
          typeof item.displayName === 'string',
      )
      .map((item) => ({
        tenantId: item.tenantId,
        userId: item.userId,
        code: item.code,
        displayName: item.displayName,
        defaultBranchId: typeof item.defaultBranchId === 'string' ? item.defaultBranchId : null,
      }));

    return {
      availableCompanies,
      companySelectionRequired: input?.companySelectionRequired === true,
    };
  }

  private async recordLoginFailure(normalizedEmail: string, actorUserId: string | null = null, tenantId: string | null = null) {
    await this.auditService.record({
      tenantId,
      actorUserId,
      entityType: 'session',
      entityId: null,
      action: 'auth.login.failed',
      eventType: 'authentication.failed',
      metadata: { email: normalizedEmail },
    });
  }

  private async revokeRefreshSession(session: UserSessionEntity, actorUserId: string): Promise<void> {
    session.status = SessionStatus.REVOKED;
    session.revokedAt = new Date();
    session.updatedAt = new Date();
    session.updatedBy = actorUserId;
    await this.userSessionRepository.save(session);
  }
}
