import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from 'src/modules/identity/application/auth/auth.service';

function createAuthService(overrides: Record<string, unknown> = {}) {
  const defaults = {
    identityService: {
      async listActiveByEmail() {
        return [];
      },
      async getContextPreference() {
        return null;
      },
      async saveContextPreference() {},
      async getById(id: string) {
        return { id, tenantId: 'tenant-1', email: 'admin@example.com', defaultBranchId: 'branch-1', status: 'active' };
      },
      async setPassword() {
        return { tenantId: 'tenant-1', defaultBranchId: 'branch-1' };
      },
    },
    userCredentialRepository: {
      async findByUserIds() {
        return [];
      },
    },
    userSessionRepository: {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async findActiveById() {
        return null;
      },
      async rotateRefreshToken() {
        return true;
      },
    },
    authorizationService: {
      async getEffectiveAccessForUser() {
        return { branchIds: ['branch-1'], permissions: ['dashboard.read'], communities: ['ADMIN'] };
      },
    },
    passwordHasherService: {
      async verify(password: string, hash: string) {
        return hash === `hashed:${password}`;
      },
    },
    tokenFactoryService: {
      async issueTokens(payload: Record<string, unknown>, refreshTokenId = 'session-1') {
        return {
          accessToken: `access:${String(payload.tenantId)}`,
          refreshToken: `refresh:${refreshTokenId}`,
          refreshTokenHash: `hash:${refreshTokenId}`,
          refreshTokenId,
        };
      },
      hashToken(token: string) {
        return `hashed-token:${token}`;
      },
      compareTokenHash(rawToken: string, hashedToken: string) {
        return `hashed-token:${rawToken}` === hashedToken;
      },
      async verifyRefreshToken() {
        return { tokenType: 'refresh', jti: 'session-1', sub: 'user-1', tenantId: 'tenant-1' };
      },
    },
    auditService: { async record() {} },
    tenantService: {
      async getById(id: string) {
        return { id, code: id.toUpperCase(), displayName: `Company ${id}` };
      },
    },
    branchService: {
      async getById(id: string) {
        return { id, tenantId: 'tenant-1' };
      },
    },
    firstAccessTokenRepository: {
      create(payload: Record<string, unknown>) {
        return payload;
      },
      async save(payload: Record<string, unknown>) {
        return payload;
      },
      async revokeActiveByUserId() {},
      async findActiveByTokenHash() {
        return null;
      },
    },
  };
  const deps = { ...defaults, ...overrides };
  return new AuthService(
    deps.identityService as never,
    deps.userCredentialRepository as never,
    deps.userSessionRepository as never,
    deps.authorizationService as never,
    deps.passwordHasherService as never,
    deps.tokenFactoryService as never,
    deps.auditService as never,
    deps.tenantService as never,
    deps.branchService as never,
    deps.firstAccessTokenRepository as never,
    {
      passwordResetMessage() {
        return 'Se o e-mail estiver cadastrado, enviaremos o link para definir a senha.';
      },
      async canEmailLinks() {
        return false;
      },
      async trySendAccessLink() {
        return { emailed: false, reason: null };
      },
    } as never,
  );
}

describe('AuthService', () => {
  it('logs in with email/password only and resolves multiple companies', async () => {
    const sessions: Array<Record<string, unknown>> = [];
    const service = createAuthService({
      identityService: {
        async listActiveByEmail(email: string) {
          assert.equal(email, 'shared@example.com');
          return [
            { id: 'user-1', tenantId: 'tenant-1', email, defaultBranchId: 'branch-1', status: 'active' },
            { id: 'user-2', tenantId: 'tenant-2', email, defaultBranchId: 'branch-2', status: 'active' },
          ];
        },
        async getContextPreference() {
          return { lastTenantId: 'tenant-2', lastBranchId: 'branch-2' };
        },
        async saveContextPreference() {},
        async getById(id: string) {
          return { id, tenantId: id === 'user-2' ? 'tenant-2' : 'tenant-1', email: 'shared@example.com', defaultBranchId: null, status: 'active' };
        },
      },
      userCredentialRepository: {
        async findByUserIds() {
          return [
            { userId: 'user-1', passwordHash: 'hashed:Secret123!' },
            { userId: 'user-2', passwordHash: 'hashed:Secret123!' },
          ];
        },
      },
      userSessionRepository: {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          sessions.push(payload);
          return payload;
        },
      },
      authorizationService: {
        async getEffectiveAccessForUser(tenantId: string, userId: string) {
          return {
            branchIds: [tenantId === 'tenant-2' ? 'branch-2' : 'branch-1'],
            permissions: ['dashboard.read'],
            communities: [userId === 'user-2' ? 'EXECUTIVES' : 'ADMINISTRATORS'],
          };
        },
      },
      tenantService: {
        async getById(id: string) {
          return { id, code: id === 'tenant-1' ? 'MAT' : 'FIL', displayName: id === 'tenant-1' ? 'Matriz' : 'Filial' };
        },
      },
    });

    const login = await service.loginWithPassword({ email: 'shared@example.com', password: 'Secret123!' });

    assert.equal(login.tenantId, 'tenant-2');
    assert.deepEqual(login.branchIds, ['branch-2']);
    assert.equal(sessions[0]?.tenantId, 'tenant-2');
    assert.equal((sessions[0]?.contextData as { companySelectionRequired: boolean }).companySelectionRequired, false);
  });

  it('stores company-selection requirement when no previous company context exists', async () => {
    const sessions: Array<Record<string, unknown>> = [];
    const service = createAuthService({
      identityService: {
        async listActiveByEmail(email: string) {
          return [
            { id: 'user-1', tenantId: 'tenant-1', email, defaultBranchId: null, status: 'active' },
            { id: 'user-2', tenantId: 'tenant-2', email, defaultBranchId: null, status: 'active' },
          ];
        },
        async getContextPreference() {
          return null;
        },
        async saveContextPreference() {},
      },
      userCredentialRepository: {
        async findByUserIds() {
          return [
            { userId: 'user-1', passwordHash: 'hashed:Secret123!' },
            { userId: 'user-2', passwordHash: 'hashed:Secret123!' },
          ];
        },
      },
      userSessionRepository: {
        create(payload: Record<string, unknown>) {
          return payload;
        },
        async save(payload: Record<string, unknown>) {
          sessions.push(payload);
          return payload;
        },
      },
    });

    await service.loginWithPassword({ email: 'shared@example.com', password: 'Secret123!' });
    assert.equal((sessions[0]?.contextData as { companySelectionRequired: boolean }).companySelectionRequired, true);
  });

  it('persists the default branch as the restored context for single-company login', async () => {
    const savedPreferences: Array<Record<string, unknown>> = [];
    const service = createAuthService({
      identityService: {
        async listActiveByEmail(email: string) {
          return [{ id: 'user-1', tenantId: 'tenant-1', email, defaultBranchId: 'branch-1', status: 'active' }];
        },
        async getContextPreference() {
          return null;
        },
        async saveContextPreference(payload: Record<string, unknown>) {
          savedPreferences.push(payload);
        },
        async getById(id: string) {
          return { id, tenantId: 'tenant-1', email: 'andre@anexsys.local', defaultBranchId: 'branch-1', status: 'active' };
        },
      },
      userCredentialRepository: {
        async findByUserIds() {
          return [{ userId: 'user-1', passwordHash: 'hashed:Secret123!' }];
        },
      },
      authorizationService: {
        async getEffectiveAccessForUser() {
          return { branchIds: ['branch-1'], permissions: ['customers.read', 'customers.write'], communities: ['GLOBAL_ADMINISTRATORS'] };
        },
      },
    });

    const login = await service.loginWithPassword({ email: 'andre@anexsys.local', password: 'Secret123!' });

    assert.equal(login.tenantId, 'tenant-1');
    assert.deepEqual(login.branchIds, ['branch-1']);
    assert.equal(savedPreferences[0]?.lastTenantId, 'tenant-1');
    assert.equal(savedPreferences[0]?.lastBranchId, 'branch-1');
  });

  it('persists selected branch as last valid context', async () => {
    const savedPreferences: Array<Record<string, unknown>> = [];
    const service = createAuthService({
      userSessionRepository: {
        async findActiveById() {
          return { id: 'session-1', tenantId: 'tenant-1', userId: 'user-1', contextData: {}, status: 'active' };
        },
      },
      identityService: {
        async saveContextPreference(payload: Record<string, unknown>) {
          savedPreferences.push(payload);
        },
        async getById() {
          return { id: 'user-1', tenantId: 'tenant-1', email: 'admin@example.com', defaultBranchId: 'branch-1', status: 'active' };
        },
      },
    });

    await service.selectBranch({ sessionId: 'session-1', actorUserId: 'user-1', branchId: 'branch-1' });
    assert.equal(savedPreferences[0]?.lastBranchId, 'branch-1');
  });

  it('keeps the session when a second refresh still carries the token that was just rotated', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const service = createAuthService({
      userSessionRepository: {
        async findActiveById() {
          return {
            id: 'session-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            status: 'active',
            expiresAt: new Date(Date.now() + 60_000),
            lastUsedAt: new Date(),
            refreshTokenHash: 'hash:current',
          };
        },
        async save(payload: Record<string, unknown>) {
          saved.push(payload);
          return payload;
        },
      },
      tokenFactoryService: {
        async verifyRefreshToken() {
          return { tokenType: 'refresh', jti: 'session-1', sub: 'user-1', tenantId: 'tenant-1' };
        },
        compareTokenHash() {
          return false;
        },
      },
    });

    await assert.rejects(() => service.refreshTokens({ refreshToken: 'refresh:previous' }), /Refresh token is invalid/);
    assert.equal(saved.length, 0);
  });

  it('revokes the session when an old refresh token returns after the rotation window', async () => {
    const saved: Array<{ status?: string }> = [];
    const service = createAuthService({
      userSessionRepository: {
        async findActiveById() {
          return {
            id: 'session-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            status: 'active',
            expiresAt: new Date(Date.now() + 60_000),
            lastUsedAt: new Date(Date.now() - 60_000),
            refreshTokenHash: 'hash:current',
          };
        },
        async save(payload: { status?: string }) {
          saved.push(payload);
          return payload;
        },
      },
      tokenFactoryService: {
        async verifyRefreshToken() {
          return { tokenType: 'refresh', jti: 'session-1', sub: 'user-1', tenantId: 'tenant-1' };
        },
        compareTokenHash() {
          return false;
        },
      },
    });

    await assert.rejects(() => service.refreshTokens({ refreshToken: 'refresh:stolen' }), /Refresh token is invalid/);
    assert.equal(saved[0]?.status, 'revoked');
  });
});
