import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { WorkGroupService } from '../application/authorization/work-group.service';

class AssignWorkGroupMemberBody {
  @IsUUID()
  userId!: string;
}

@Controller('work-groups')
export class WorkGroupsController {
  constructor(
    @Inject(WorkGroupService)
    private readonly workGroupService: WorkGroupService,
  ) {}

  @Permissions('users.read')
  @Get()
  async list(@CurrentTenantId() tenantId: string | null) {
    if (!tenantId) throw new BadRequestException('Tenant context is required.');
    return this.workGroupService.list(tenantId);
  }

  @Permissions('users.write')
  @Post(':workGroupId/members')
  async assignMember(
    @Param('workGroupId', new ParseUUIDPipe()) workGroupId: string,
    @Body() body: AssignWorkGroupMemberBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    return this.workGroupService.assignMember(tenantId, workGroupId, body.userId, principal.userId);
  }
}
