import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, UnauthorizedException } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { FLOOR_PROFILES, type FloorProfile } from '../application/floor-schedule.rules';
import { Type } from 'class-transformer';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { FloorScheduleService } from '../application/floor-schedule.service';

class AddTechnicianBody {
  @IsUUID()
  userId!: string;
}

class TechnicianStatusBody {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}

class SaveCollaboratorBody {
  @IsUUID()
  userId!: string;

  @IsIn(FLOOR_PROFILES)
  profile!: FloorProfile;

  @IsNumber()
  @Min(0)
  @Max(999999.99)
  dailyRate!: number;

  @IsInt()
  @Min(0)
  @Max(999)
  piecesPerDay!: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

class ScheduleMarkBody {
  @IsUUID()
  technicianId!: string;

  @IsArray()
  @IsString({ each: true })
  dates!: string[];
}

class SaveScheduleBody {
  @IsUUID()
  branchId!: string;

  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleMarkBody)
  marks!: ScheduleMarkBody[];
}

class SavePeriodBody extends SaveScheduleBody {
  @IsOptional()
  @IsUUID()
  id?: string;
}

class CodeBody {
  @IsString()
  code!: string;
}

class OpenSessionBody extends CodeBody {
  @IsOptional()
  @IsUUID()
  technicianId?: string;
}

class ReadOrderBody {
  @IsString()
  codeValue!: string;
}

class AdvanceBody {
  @IsUUID()
  serviceOrderId!: string;
}

@Controller('floor-schedule')
export class FloorScheduleController {
  constructor(
    @Inject(FloorScheduleService)
    private readonly floorScheduleService: FloorScheduleService,
  ) {}

  @Permissions('floor_schedule.write')
  @Get('candidates')
  async candidates(@CurrentTenantId() tenantId: string | null) {
    return this.floorScheduleService.listCandidates(this.tenant(tenantId));
  }

  @Permissions('floor_schedule.write')
  @Get('technicians')
  async listTechnicians(@CurrentTenantId() tenantId: string | null) {
    return this.floorScheduleService.listTechnicians(this.tenant(tenantId));
  }

  @Permissions('floor_schedule.write')
  @Put('collaborators')
  async saveCollaborator(
    @Body() body: SaveCollaboratorBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    return this.floorScheduleService.saveCollaborator(
      this.tenant(tenantId),
      {
        userId: body.userId,
        profile: body.profile,
        dailyRate: body.dailyRate,
        piecesPerDay: body.piecesPerDay,
        status: body.status ?? 'active',
      },
      this.actor(request),
    );
  }

  @Permissions('floor_schedule.write')
  @Get('outlook')
  async outlook(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.outlook(this.tenant(tenantId), branchId, from, to);
  }

  @Permissions('floor_schedule.write')
  @Post('technicians')
  async addTechnician(
    @Body() body: AddTechnicianBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const actor = this.actor(request);
    return this.floorScheduleService.addTechnician(this.tenant(tenantId), body.userId, actor);
  }

  @Permissions('floor_schedule.write')
  @Patch('technicians/:technicianId')
  async setStatus(
    @Param('technicianId', new ParseUUIDPipe()) technicianId: string,
    @Body() body: TechnicianStatusBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    return this.floorScheduleService.setTechnicianStatus(this.tenant(tenantId), technicianId, body.status, this.actor(request));
  }

  @Get('day-board')
  async dayBoard(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.dayBoard(this.tenant(tenantId), branchId);
  }

  @Permissions('floor_schedule.write')
  @Get('days')
  async days(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.getSchedule(this.tenant(tenantId), branchId, from, to);
  }

  @Permissions('floor_schedule.write')
  @Put('days')
  async saveDays(
    @Body() body: SaveScheduleBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, body.branchId);
    return this.floorScheduleService.saveSchedule(
      this.tenant(tenantId),
      body.branchId,
      body.from,
      body.to,
      body.marks,
      this.actor(request),
    );
  }

  @Permissions('floor_schedule.write')
  @Get('periods')
  async periods(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.listPeriods(this.tenant(tenantId), branchId);
  }

  @Permissions('floor_schedule.write')
  @Get('periods/:periodId')
  async period(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.getPeriod(this.tenant(tenantId), branchId, periodId);
  }

  @Permissions('floor_schedule.write')
  @Put('periods')
  async savePeriod(
    @Body() body: SavePeriodBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, body.branchId);
    return this.floorScheduleService.savePeriod(
      this.tenant(tenantId),
      body.branchId,
      body.id ?? null,
      body.from,
      body.to,
      body.marks,
      this.actor(request),
    );
  }

  @Permissions('floor_schedule.write')
  @Delete('periods/:periodId')
  async deletePeriod(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    await this.floorScheduleService.deletePeriod(this.tenant(tenantId), branchId, periodId, this.actor(request));
    return { id: periodId };
  }

  @Permissions('floor_schedule.write')
  @Get('checkin-codes')
  async codes(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.ensureCheckinCodes(this.tenant(tenantId), branchId, this.actor(request));
  }

  @Permissions('service_orders.read')
  @Get('today')
  async today(
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    this.assertBranch(request, branchId);
    return this.floorScheduleService.today(this.tenant(tenantId), branchId);
  }

  @Permissions('production_orders.read')
  @Post('checkin')
  async checkin(@Body() body: CodeBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(request);
    return this.floorScheduleService.openCheckin(
      this.tenant(tenantId),
      body.code,
      principal.effectivePermissions,
      principal.effectiveBranchIds,
    );
  }

  @Permissions('production_orders.read')
  @Post('sessions')
  async openSession(
    @Body() body: OpenSessionBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = this.principal(request);
    return this.floorScheduleService.openSession(
      this.tenant(tenantId),
      body.code,
      principal.userId,
      principal.effectivePermissions,
      principal.effectiveBranchIds,
      body.technicianId,
    );
  }

  @Permissions('production_orders.read')
  @Post('sessions/:sessionId/close')
  async close(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    return this.floorScheduleService.closeSession(this.tenant(tenantId), sessionId, this.actor(request));
  }

  @Permissions('production_orders.read')
  @Post('sessions/:sessionId/read')
  async read(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: ReadOrderBody,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const principal = this.principal(request);
    return this.floorScheduleService.readOrder(this.tenant(tenantId), sessionId, body.codeValue, principal.effectiveBranchIds);
  }

  @Permissions('production_orders.read')
  @Post('sessions/:sessionId/advance')
  async advance(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AdvanceBody,
    @CurrentTenantId() tenantId: string | null,
  ) {
    return this.floorScheduleService.advance(this.tenant(tenantId), sessionId, body.serviceOrderId);
  }

  private tenant(tenantId: string | null) {
    if (!tenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return tenantId;
  }

  private principal(request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!principal) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return principal;
  }

  private actor(request: PlatformRequest) {
    return this.principal(request).userId;
  }

  private assertBranch(request: PlatformRequest, branchId: string) {
    const principal = this.principal(request);
    if (!principal.effectiveBranchIds.includes(branchId)) {
      throw new UnauthorizedException('Filial fora do seu acesso.');
    }
  }
}
