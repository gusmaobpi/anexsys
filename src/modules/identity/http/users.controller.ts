import {
  Inject,
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AuthorizationService } from 'src/modules/authorization/application/authorization/authorization.service';
import { EmailSettingsService } from 'src/modules/email/application/email-settings.service';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { BranchScopeType, UserStatus } from 'src/shared/domain/enums';
import { CurrentRequest, CurrentTenantId, CurrentUserId } from 'src/platform/http/request-context.decorators';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { AuthService } from '../application/auth/auth.service';
import { IdentityService } from '../application/identity/identity.service';

class CreateUserBody {
  @IsOptional()
  @IsUUID()
  defaultBranchId?: string;

  @IsEmail()
  email!: string;

  @IsString()
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  portraitMimeType?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300_000)
  portraitBase64?: string | null;
}

class InviteUserBody {
  @IsOptional()
  @IsUUID()
  defaultBranchId?: string;

  @IsEmail()
  email!: string;

  @IsString()
  displayName!: string;
}

class AssignRoleBody {
  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  assignedBranchId?: string;

  @IsOptional()
  @IsBoolean()
  grantsAllBranches?: boolean;
}

class AssignBranchScopeBody {
  @IsUUID()
  branchId!: string;

  @IsEnum(BranchScopeType)
  scopeType!: BranchScopeType;
}

class UpdateUserBody {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  defaultBranchId?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  portraitMimeType?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300_000)
  portraitBase64?: string | null;
}

@Controller('users')
export class UsersController {
  constructor(
    @Inject(IdentityService)
    private readonly identityService: IdentityService,
    @Inject(AuthorizationService)
    private readonly authorizationService: AuthorizationService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(EmailSettingsService)
    private readonly emailSettingsService: EmailSettingsService,
  ) {}

  @Permissions('users.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    return this.identityService.listByTenant(tenantId);
  }

  @Permissions('users.write')
  @Post()
  async create(
    @Body() body: CreateUserBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.identityService.createUser({ ...body, tenantId, actorUserId });
  }

  @Permissions('users.write')
  @Post('invite')
  async invite(
    @Body() body: InviteUserBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const user = await this.identityService.inviteUser({ ...body, tenantId, actorUserId });
    const delivery = await this.issueAccessLink(tenantId, actorUserId, user);
    return { user, ...delivery };
  }

  @Permissions('users.read')
  @Get('me/effective-permissions')
  async getMyEffectivePermissions(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    if (!tenantId || !userId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return this.authorizationService.getEffectiveAccessForUser(tenantId, userId);
  }

  @Permissions('users.read')
  @Get(':userId')
  async getById(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }

    return user;
  }

  @Permissions('users.read')
  @Get(':userId/access-summary')
  async getAccessSummary(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }

    return this.authorizationService.getUserAccessSummary(tenantId, userId);
  }

  @Permissions('users.read')
  @Get(':userId/access-impact')
  async getAccessImpact(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentTenantId() tenantId: string | null) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }

    return this.authorizationService.getUserAccessImpact(tenantId, userId);
  }

  @Permissions('users.write')
  @Patch(':userId')
  async update(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: UpdateUserBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }
    if (body.defaultBranchId && !principal?.effectiveBranchIds.includes(body.defaultBranchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    return this.identityService.updateUser(userId, { ...body, actorUserId });
  }

  @Permissions('users.write')
  @Delete(':userId')
  async remove(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }

    await this.identityService.removeUser(userId, tenantId, actorUserId);
    return { id: userId, deleted: true };
  }

  @Permissions('users.write')
  @Post(':userId/roles')
  async assignRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: AssignRoleBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    if (body.assignedBranchId && !principal?.effectiveBranchIds.includes(body.assignedBranchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    await this.authorizationService.assignRole({
      tenantId,
      userId,
      roleId: body.roleId,
      assignedBranchId: body.assignedBranchId,
      grantsAllBranches: body.grantsAllBranches,
      actorUserId,
    });

    return { success: true };
  }

  @Permissions('users.write')
  @Post(':userId/branch-scopes')
  async assignBranchScope(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: AssignBranchScopeBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    const actorUserId = principal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    if (!principal?.effectiveBranchIds.includes(body.branchId)) {
      throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
    }

    await this.authorizationService.assignBranchScope({
      tenantId,
      userId,
      branchId: body.branchId,
      scopeType: body.scopeType,
      actorUserId,
    });

    return { success: true };
  }

  @Permissions('users.write')
  @Post(':userId/access-link')
  async sendAccessLink(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actorUserId = request.requestContext.authenticatedPrincipal?.userId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user is required.');
    }
    const user = await this.identityService.getById(userId);
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Requested user is outside the authenticated tenant scope.');
    }
    if (user.isDeleted) {
      throw new DomainValidationError('O usuário não está mais na lista.');
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new DomainValidationError('Usuário inativo não recebe link. Ative o cadastro antes.');
    }
    return this.issueAccessLink(tenantId, actorUserId, user);
  }

  private async issueAccessLink(
    tenantId: string,
    actorUserId: string,
    user: { id: string; email: string; displayName: string },
  ) {
    const firstAccess = await this.authService.issueFirstAccessToken({
      tenantId,
      userId: user.id,
      actorUserId,
      email: user.email,
      deliveryChannel: 'email',
    });
    const delivery = await this.emailSettingsService.trySendAccessLink({
      tenantId,
      to: user.email,
      displayName: user.displayName,
      token: firstAccess.token,
      purpose: 'invite',
    });
    if (delivery.emailed) {
      return { emailed: true as const };
    }
    return { emailed: false as const, firstAccess, reason: delivery.reason };
  }
}
