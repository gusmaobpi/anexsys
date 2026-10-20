import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from 'src/modules/authorization/application/authorization/authorization.service';
import {
  ensureRequestContext,
  normalizeRequestValue,
  PlatformRequest,
  resolveBranchId,
  resolveTenantId,
} from 'src/platform/http/request-context';
import { TokenFactoryService } from './token-factory.service';
import { IS_PUBLIC_KEY, isPublicExecutionContext } from './public.decorator';
import type { EffectiveAccessResult } from 'src/modules/authorization/application/authorization/authorization.service';

const accessInflight = new Map<string, Promise<EffectiveAccessResult>>();

function cachedEffectiveAccess(
  load: (tenantId: string, userId: string) => Promise<EffectiveAccessResult>,
  tenantId: string,
  userId: string,
): Promise<EffectiveAccessResult> {
  const key = `${tenantId}:${userId}`;
  const hit = accessInflight.get(key);
  if (hit) {
    return hit;
  }
  const value = load(tenantId, userId).finally(() => {
    accessInflight.delete(key);
  });
  accessInflight.set(key, value);
  return value;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TokenFactoryService)
    private readonly tokenFactoryService: TokenFactoryService,
    @Inject(AuthorizationService)
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      Boolean(
        this.reflector?.getAllAndOverride?.<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]),
      ) || isPublicExecutionContext(context);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const requestContext = ensureRequestContext(request);
    const rawToken = requestContext.authToken;
    if (!rawToken) {
      throw new UnauthorizedException('Authorization bearer token is required.');
    }

    let payload;
    try {
      payload = await this.tokenFactoryService.verifyAccessToken(rawToken);
    } catch {
      throw new UnauthorizedException('JWT access token is invalid.');
    }

    const tokenTenantId = normalizeRequestValue(payload.tenantId);
    if (!tokenTenantId || !payload.sub) {
      throw new UnauthorizedException('JWT access token is invalid.');
    }

    const effectiveAccess = await cachedEffectiveAccess(
      (tenantId, userId) => this.authorizationService.getEffectiveAccessForUser(tenantId, userId),
      tokenTenantId,
      payload.sub,
    );
    const requestedTenantId = resolveTenantId(request);
    if (requestedTenantId && requestedTenantId !== tokenTenantId) {
      throw new ForbiddenException('Requested tenant is outside the authenticated tenant scope.');
    }

    const requestedBranchId = resolveBranchId(request);
    if (requestedBranchId && !effectiveAccess.branchIds.includes(requestedBranchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    requestContext.authenticatedPrincipal = {
      userId: payload.sub,
      tenantId: tokenTenantId,
      sessionId: payload.sessionId,
      branchIds: effectiveAccess.branchIds,
      tokenPermissions: payload.permissions,
      effectivePermissions: effectiveAccess.permissions,
      effectiveBranchIds: effectiveAccess.branchIds,
      communities: effectiveAccess.communities,
    };

    if (!normalizeRequestValue(requestContext.requestedTenantId)) {
      requestContext.requestedTenantId = tokenTenantId;
    }

    return true;
  }
}
