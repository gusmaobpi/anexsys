import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { CurrentTenantId, CurrentUserId } from 'src/platform/http/request-context.decorators';
import { PrivacyService } from '../application/privacy.service';

class UpdatePrivacySettingsBody {
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  privacyNotice!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  acceptanceText!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  operatorTerms!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  incidentPlan!: string;

  @IsInt()
  @Min(0)
  @Max(3650)
  linkMarginDays!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  retentionInactiveYears!: number;

  @IsInt()
  @Min(1)
  @Max(3650)
  addressRetentionDays!: number;

  @IsInt()
  @Min(1)
  @Max(90)
  subjectResponseDays!: number;

  @IsString()
  @MaxLength(120)
  dpoName!: string;

  @IsString()
  @MaxLength(200)
  dpoEmail!: string;
}

class CreateSubjectRequestBody {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  requesterName!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsIn(['access', 'correction', 'anonymization', 'deletion', 'portability'])
  requestType!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description!: string;
}

class AnswerSubjectRequestBody {
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  responseText!: string;
}

class UpdateActivityBody {
  @IsString()
  @MaxLength(2000)
  notes!: string;
}

class CreateIncidentBody {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description!: string;

  @IsString()
  occurredOn!: string;
}

class UpdateIncidentBody {
  @IsIn(['open', 'contained', 'notified'])
  status!: string;
}

@Controller('privacy')
export class PrivacyController {
  constructor(
    @Inject(PrivacyService)
    private readonly privacyService: PrivacyService,
  ) {}

  @Permissions('privacy.read')
  @Get('settings')
  getSettings(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    return this.privacyService.getSettings(this.requireScope(tenantId, userId).tenantId, userId as string);
  }

  @Permissions('privacy.write')
  @Patch('settings')
  updateSettings(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Body() body: UpdatePrivacySettingsBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.updateSettings(scope.tenantId, scope.userId, body);
  }

  @Permissions('privacy.read')
  @Get('requests')
  listRequests(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    return this.privacyService.listRequests(this.requireScope(tenantId, userId).tenantId);
  }

  @Permissions('privacy.write')
  @Post('requests')
  createRequest(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Body() body: CreateSubjectRequestBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.createRequest(scope.tenantId, scope.userId, body);
  }

  @Permissions('privacy.write')
  @Patch('requests/:requestId')
  answerRequest(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() body: AnswerSubjectRequestBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.updateRequest(scope.tenantId, scope.userId, requestId, body.responseText);
  }

  @Permissions('privacy.read')
  @Post('requests/:requestId/access-summary')
  accessSummary(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.privacyService.accessSummary(this.requireScope(tenantId, userId).tenantId, requestId);
  }

  @Permissions('privacy.read')
  @Get('activities')
  listActivities(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.listActivities(scope.tenantId, scope.userId);
  }

  @Permissions('privacy.write')
  @Patch('activities/:activityId')
  updateActivity(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() body: UpdateActivityBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.updateActivityNotes(scope.tenantId, scope.userId, activityId, body.notes);
  }

  @Permissions('privacy.read')
  @Get('incidents')
  listIncidents(@CurrentTenantId() tenantId: string | null, @CurrentUserId() userId: string | null) {
    return this.privacyService.listIncidents(this.requireScope(tenantId, userId).tenantId);
  }

  @Permissions('privacy.write')
  @Post('incidents')
  createIncident(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Body() body: CreateIncidentBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.createIncident(scope.tenantId, scope.userId, body);
  }

  @Permissions('privacy.write')
  @Patch('incidents/:incidentId')
  updateIncident(
    @CurrentTenantId() tenantId: string | null,
    @CurrentUserId() userId: string | null,
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() body: UpdateIncidentBody,
  ) {
    const scope = this.requireScope(tenantId, userId);
    return this.privacyService.updateIncident(scope.tenantId, scope.userId, incidentId, body.status);
  }

  private requireScope(tenantId: string | null, userId: string | null) {
    if (!tenantId || !userId) {
      throw new UnauthorizedException('Authenticated tenant context is required.');
    }
    return { tenantId, userId };
  }
}
