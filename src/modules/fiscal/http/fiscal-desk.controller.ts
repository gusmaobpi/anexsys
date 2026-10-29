import { Body, Controller, ForbiddenException, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UnauthorizedException } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Permissions } from 'src/platform/auth/permissions.decorator';
import { PlatformRequest } from 'src/platform/http/request-context';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { FiscalDeskService } from '../application/fiscal/fiscal-desk.service';

class BranchBody {
  @IsUUID()
  branchId!: string;
}

class SettingsBody extends BranchBody {
  @IsString()
  legalName!: string;

  @IsOptional() @IsString() tradeName?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() municipalRegistration?: string;
  @IsOptional() @IsString() stateRegistration?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() taxRegime?: string;
  @IsOptional() @IsString() mainCnae?: string;
  @IsOptional() @IsString() defaultServiceCode?: string;
  @IsOptional() @IsString() defaultIssRate?: string;
  @IsOptional() @IsString() fiscalEmail?: string;
  @IsOptional() @IsString() fiscalResponsible?: string;
}

class CertificateBody extends BranchBody {
  @IsString() name!: string;
  @IsString() pfxBase64!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() issuedAt?: string;
  @IsString() expiresAt!: string;
}

class EnvironmentBody extends BranchBody {
  @IsIn(['homologation', 'production'])
  kind!: 'homologation' | 'production';

  @IsOptional() @IsUUID() certificateId?: string;
}

class MarksBody {
  @IsArray() @IsUUID('4', { each: true })
  ids!: string[];
}

class BatchBody extends BranchBody {
  @IsIn(['per_order', 'consolidated'])
  mode!: 'per_order' | 'consolidated';

  @IsArray() @IsUUID('4', { each: true })
  orderIds!: string[];
}

class CancelBody {
  @IsString() @MinLength(15)
  reason!: string;
}

@Controller('fiscal')
export class FiscalDeskController {
  constructor(@Inject(FiscalDeskService) private readonly fiscalDeskService: FiscalDeskService) {}

  @Permissions('fiscal.read')
  @Get('branches')
  branches(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.branches(principal.tenantId);
  }

  @Permissions('fiscal.admin')
  @Get('settings')
  settings(@Query('branchId', new ParseUUIDPipe()) branchId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, branchId);
    return this.fiscalDeskService.settings(principal.tenantId, branchId);
  }

  @Permissions('fiscal.admin')
  @Put('settings')
  saveSettings(@Body() body: SettingsBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, body.branchId);
    return this.fiscalDeskService.saveSettings(principal.tenantId, principal.userId, body);
  }

  @Permissions('fiscal.admin')
  @Get('certificates')
  certificates(@Query('branchId') branchId: string | undefined, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    if (branchId) this.branch(principal.branches, branchId);
    return this.fiscalDeskService.certificates(principal.tenantId, branchId);
  }

  @Permissions('fiscal.admin')
  @Post('certificates')
  saveCertificate(@Body() body: CertificateBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, body.branchId);
    return this.fiscalDeskService.saveCertificate(principal.tenantId, principal.userId, body);
  }

  @Permissions('fiscal.admin')
  @Post('certificates/:id/validate')
  validate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.validateCertificate(principal.tenantId, id);
  }

  @Permissions('fiscal.admin')
  @Post('certificates/:id/test')
  test(@Param('id', new ParseUUIDPipe()) id: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.testCertificate(principal.tenantId, principal.userId, id);
  }

  @Permissions('fiscal.admin')
  @Get('environments')
  environments(@Query('branchId', new ParseUUIDPipe()) branchId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, branchId);
    return this.fiscalDeskService.environments(principal.tenantId, branchId);
  }

  @Permissions('fiscal.admin')
  @Put('environments')
  selectEnvironment(@Body() body: EnvironmentBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, body.branchId);
    return this.fiscalDeskService.selectEnvironment(principal.tenantId, principal.userId, body.branchId, body.kind, body.certificateId ?? null);
  }

  @Permissions('fiscal.read')
  @Post('order-marks')
  marks(@Body() body: MarksBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.orderMarks(principal.tenantId, body.ids);
  }

  @Permissions('fiscal.write')
  @Get('service-orders/:id/preview')
  preview(@Param('id', new ParseUUIDPipe()) id: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.preview(principal.tenantId, id);
  }

  @Permissions('fiscal.write')
  @Post('batches')
  batch(@Body() body: BatchBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, body.branchId);
    return this.fiscalDeskService.enqueue(principal.tenantId, principal.userId, body.branchId, body.orderIds, body.mode);
  }

  @Permissions('fiscal.read')
  @Get('batches/:id')
  batchStatus(@Param('id', new ParseUUIDPipe()) id: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.batch(principal.tenantId, id);
  }

  @Permissions('fiscal.read')
  @Get('history')
  history(@Query('branchId') branchId: string | undefined, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    if (branchId) this.branch(principal.branches, branchId);
    return this.fiscalDeskService.history(principal.tenantId, branchId);
  }

  @Permissions('fiscal.read')
  @Get('documents/:id/file')
  file(@Param('id', new ParseUUIDPipe()) id: string, @Query('kind') kind: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.download(principal.tenantId, id, kind === 'pdf' ? 'pdf' : 'xml');
  }

  @Permissions('fiscal.write')
  @Post('documents/:id/cancel')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CancelBody, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.cancel(principal.tenantId, principal.userId, id, body.reason);
  }

  @Permissions('fiscal.read')
  @Get('pending')
  pending(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.pending(principal.tenantId);
  }

  @Permissions('fiscal.write')
  @Post('pending/:id/reprocess')
  reprocess(@Param('id', new ParseUUIDPipe()) id: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.reprocess(principal.tenantId, principal.userId, id);
  }

  @Permissions('fiscal.write')
  @Get('eligible')
  eligible(@Query('branchId', new ParseUUIDPipe()) branchId: string, @CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    this.branch(principal.branches, branchId);
    return this.fiscalDeskService.eligible(principal.tenantId, branchId);
  }

  @Permissions('fiscal.audit')
  @Get('audit')
  trail(@CurrentTenantId() tenantId: string | null, @CurrentRequest() request: PlatformRequest) {
    const principal = this.principal(tenantId, request);
    return this.fiscalDeskService.auditTrail(principal.tenantId);
  }

  private principal(tenantId: string | null, request: PlatformRequest) {
    const user = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !user) throw new UnauthorizedException('Authenticated tenant context is required.');
    return { tenantId, userId: user.userId, branches: user.effectiveBranchIds };
  }

  private branch(branches: string[], branchId: string) {
    if (!branches.includes(branchId)) throw new ForbiddenException('Requested branch is outside the authenticated branch scope.');
  }
}
