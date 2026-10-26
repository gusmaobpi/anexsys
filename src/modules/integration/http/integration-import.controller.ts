import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentRequest, CurrentTenantId } from 'src/platform/http/request-context.decorators';
import { PlatformRequest } from 'src/platform/http/request-context';
import { IMPORT_KINDS, importPermission, isImportKind, type ImportKind, type ImportRow } from '../application/integration-import.rules';
import { IntegrationRunService } from '../application/integration-run.service';

@Controller('integration')
export class IntegrationImportController {
  constructor(
    @Inject(IntegrationRunService)
    private readonly integrationRunService: IntegrationRunService,
  ) {}

  @Post('import/:kind')
  async import(
    @Param('kind') kind: string,
    @Body() body: { rows?: ImportRow[] },
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.context(kind, tenantId, request);
    if (!Array.isArray(body.rows)) throw new BadRequestException('A planilha não trouxe linhas.');
    const rows = body.rows.map((row, index) => ({ ...row, __line: row.__line ?? index + 2 }));
    return this.integrationRunService.start(context.kind, context.tenantId, context.userId, rows);
  }

  @Get('history')
  async history(
    @Query('status') status: string | undefined,
    @Query('errorCode') errorCode: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    return this.integrationRunService.listHistory(context.tenantId, this.visibleKinds(request), {
      status,
      errorCode,
      kind,
      q,
      page: Number(page || 1),
      pageSize: Number(pageSize || 10),
    });
  }

  @Post('history/reprocess')
  async reprocessHistory(
    @Body() body: { errorCode?: string },
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    if (!body.errorCode) throw new BadRequestException('Informe o tipo de erro para reprocessar.');
    return this.integrationRunService.reprocessMatching(context.tenantId, context.userId, this.visibleKinds(request), body.errorCode);
  }

  @Get('runs')
  async list(
    @Query('kinds') kinds: string | undefined,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    const parsed = (kinds ?? '')
      .split(',')
      .map((kind) => kind.trim())
      .filter((kind): kind is ImportKind => isImportKind(kind));
    if (parsed.length === 0) throw new BadRequestException('Informe o layout da migração.');
    for (const kind of parsed) this.assertPermission(kind, request);
    return this.integrationRunService.list(context.tenantId, parsed);
  }

  @Get('runs/:id')
  async run(
    @Param('id') id: string,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    const run = await this.integrationRunService.getRun(id, context.tenantId);
    if (isImportKind(run.kind)) this.assertPermission(run.kind, request);
    return run;
  }

  @Get('runs/:id/lines')
  async lines(
    @Param('id') id: string,
    @Query('status') status: string | undefined,
    @Query('errorCode') errorCode: string | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    const run = await this.integrationRunService.getRun(id, context.tenantId);
    if (isImportKind(run.kind)) this.assertPermission(run.kind, request);
    return this.integrationRunService.listLines(id, context.tenantId, {
      status,
      errorCode,
      page: Number(page || 1),
      pageSize: Number(pageSize || 10),
    });
  }

  @Patch('runs/:id/lines/:lineId')
  async saveLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: { rows?: ImportRow[] },
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    const run = await this.integrationRunService.getRun(id, context.tenantId);
    if (isImportKind(run.kind)) this.assertPermission(run.kind, request);
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw new BadRequestException('A linha não tem dados para salvar.');
    return this.integrationRunService.saveLine(id, lineId, context.tenantId, context.userId, body.rows);
  }

  @Post('runs/:id/reprocess')
  async reprocess(
    @Param('id') id: string,
    @Body() body: { lineIds?: string[]; errorCode?: string },
    @CurrentTenantId() tenantId: string | null,
    @CurrentRequest() request: PlatformRequest,
  ) {
    const context = this.tenant(tenantId, request);
    const run = await this.integrationRunService.getRun(id, context.tenantId);
    if (isImportKind(run.kind)) this.assertPermission(run.kind, request);
    return this.integrationRunService.reprocess(id, context.tenantId, context.userId, {
      lineIds: Array.isArray(body.lineIds) ? body.lineIds : undefined,
      errorCode: body.errorCode,
    });
  }

  private context(kind: string, tenantId: string | null, request: PlatformRequest) {
    const base = this.tenant(tenantId, request);
    if (!isImportKind(kind)) throw new BadRequestException('Layout de importação desconhecido.');
    this.assertPermission(kind, request);
    return { ...base, kind };
  }

  private tenant(tenantId: string | null, request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!tenantId || !principal) throw new UnauthorizedException('Authenticated tenant context is required.');
    return { tenantId, userId: principal.userId };
  }

  private visibleKinds(request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    if (!principal) return [];
    if (principal.effectivePermissions.includes('users.write')) return [...IMPORT_KINDS];
    return IMPORT_KINDS.filter((kind) => principal.effectivePermissions.includes(importPermission(kind)));
  }

  private assertPermission(kind: ImportKind, request: PlatformRequest) {
    const principal = request.requestContext.authenticatedPrincipal;
    const permission = importPermission(kind);
    if (!principal?.effectivePermissions.includes(permission)) {
      throw new ForbiddenException(`Missing required permission '${permission}'.`);
    }
  }
}
