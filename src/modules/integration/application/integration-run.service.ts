import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { TenantContext } from 'src/platform/tenancy/tenant-context';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';
import { IntegrationImportService } from './integration-import.service';
import { isAlreadyExists, isImportKind, type ImportKind, type ImportRow } from './integration-import.rules';
import {
  buildImportUnits,
  classifyImportError,
  describeRunProgress,
  type LineStatus,
  type RunStatus,
} from './integration-run.rules';

type RunRow = {
  id: string;
  process_no: number;
  kind: string;
  status: RunStatus;
  total_count: number;
  processed_count: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
  started_at: Date | string;
  finished_at: Date | string | null;
};

type LineRow = {
  id: string;
  line_no: number;
  status: LineStatus;
  error_code: string | null;
  error_message: string | null;
  hint: string | null;
  payload: ImportRow[] | string;
  source_payload: ImportRow[] | string;
};

@Injectable()
export class IntegrationRunService implements OnModuleInit {
  private readonly active = new Set<string>();

  constructor(
    @Inject(DataSource)
    private readonly dataSource: DataSource,
    @Inject(IntegrationImportService)
    private readonly importService: IntegrationImportService,
  ) {}

  async onModuleInit() {
    const runs = (await this.dataSource.query(
      `SELECT id, tenant_id, created_by
       FROM integration_runs
       WHERE status = 'running' AND created_by IS NOT NULL`,
    )) as Array<{ id: string; tenant_id: string; created_by: string }>;
    for (const run of runs) this.kick(run.id, run.tenant_id, run.created_by);
  }

  async start(kind: ImportKind, tenantId: string, actorUserId: string, rows: ImportRow[]) {
    const units = buildImportUnits(kind, rows);
    if (units.length === 0) throw new DomainValidationError('A planilha não tem linhas para importar.');
    const runId = randomUUID();
    const inserted = (await this.dataSource.query(
      `INSERT INTO integration_runs (
         id, tenant_id, process_no, kind, status, total_count, processed_count,
         created_count, skipped_count, error_count, started_at, created_by, updated_at
       )
       SELECT $1, $2, COALESCE((SELECT MAX(process_no) FROM integration_runs WHERE tenant_id = $2), 0) + 1,
              $3, 'running', $4, 0, 0, 0, 0, now(), $5, now()
       RETURNING id, process_no`,
      [runId, tenantId, kind, units.length, actorUserId],
    )) as Array<{ id: string; process_no: number }>;
    for (let offset = 0; offset < units.length; offset += 200) {
      const chunk = units.slice(offset, offset + 200);
      await this.dataSource.query(
        `INSERT INTO integration_run_lines (id, tenant_id, run_id, line_no, status, payload, source_payload)
         SELECT gen_random_uuid(), $1, $2, x.line_no, 'pending', x.payload::jsonb, x.payload::jsonb
         FROM unnest($3::int[], $4::text[]) AS x(line_no, payload)`,
        [tenantId, runId, chunk.map((unit) => unit.lineNo), chunk.map((unit) => JSON.stringify(unit.payload))],
      );
    }
    this.kick(runId, tenantId, actorUserId);
    return this.getRun(runId, tenantId, inserted[0]?.process_no);
  }

  async listHistory(
    tenantId: string,
    kinds: ImportKind[],
    query: { status?: string; errorCode?: string; kind?: string; q?: string; page?: number; pageSize?: number },
  ) {
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const page = Math.max(1, query.page ?? 1);
    if (kinds.length === 0) {
      return { lines: [], page, pageSize, total: 0, errorTypes: [], counts: { pending: 0, created: 0, skipped: 0, error: 0 }, running: null };
    }
    const scope: string[] = ['l.tenant_id = $1', 'r.tenant_id = $1', 'r.kind = ANY($2::text[])'];
    const scopeParams: Array<string | number | string[]> = [tenantId, kinds];
    if (query.kind && kinds.includes(query.kind as ImportKind)) {
      scopeParams.push(query.kind);
      scope.push(`r.kind = $${scopeParams.length}`);
    }
    const term = query.q?.trim();
    if (term) {
      scopeParams.push(`%${term}%`);
      const like = `$${scopeParams.length}`;
      scopeParams.push(term);
      const exact = `$${scopeParams.length}`;
      scope.push(`(r.process_no::text = ${exact} OR COALESCE(l.error_message, '') ILIKE ${like} OR COALESCE(l.hint, '') ILIKE ${like})`);
    }
    const scopeSql = scope.join(' AND ');
    const filters = [...scope];
    const params = [...scopeParams];
    if (query.status === 'created' || query.status === 'skipped' || query.status === 'error' || query.status === 'pending') {
      params.push(query.status);
      filters.push(`l.status = $${params.length}`);
    }
    if (query.errorCode) {
      params.push(query.errorCode);
      filters.push(`l.error_code = $${params.length}`);
    }
    const where = filters.join(' AND ');
    const totalRows = (await this.dataSource.query(
      `SELECT count(*)::int AS count
       FROM integration_run_lines l
       JOIN integration_runs r ON r.id = l.run_id
       WHERE ${where}`,
      params,
    )) as Array<{ count: number }>;
    const lines = (await this.dataSource.query(
      `SELECT l.id, l.line_no, l.status, l.error_code, l.error_message, l.hint, l.payload, l.source_payload,
              r.id AS run_id, r.process_no, r.kind, r.started_at
       FROM integration_run_lines l
       JOIN integration_runs r ON r.id = l.run_id
       WHERE ${where}
       ORDER BY r.started_at DESC, r.process_no DESC, l.line_no
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as Array<LineRow & { run_id: string; process_no: number; kind: string; started_at: Date | string }>;
    const types = (await this.dataSource.query(
      `SELECT l.error_code, max(l.hint) AS hint, count(*)::int AS count
       FROM integration_run_lines l
       JOIN integration_runs r ON r.id = l.run_id
       WHERE ${scopeSql} AND l.status = 'error' AND l.error_code IS NOT NULL
       GROUP BY l.error_code
       ORDER BY count DESC, l.error_code`,
      scopeParams,
    )) as Array<{ error_code: string; hint: string | null; count: number }>;
    const counts = (await this.dataSource.query(
      `SELECT l.status, count(*)::int AS count
       FROM integration_run_lines l
       JOIN integration_runs r ON r.id = l.run_id
       WHERE ${scopeSql}
       GROUP BY l.status`,
      scopeParams,
    )) as Array<{ status: LineStatus; count: number }>;
    const tally = { pending: 0, created: 0, skipped: 0, error: 0 };
    for (const row of counts) tally[row.status] = row.count;
    const runningRows = (await this.dataSource.query(
      `SELECT id, process_no, kind, status, total_count, processed_count, created_count, skipped_count, error_count, started_at, finished_at
       FROM integration_runs
       WHERE tenant_id = $1 AND kind = ANY($2::text[]) AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
      [tenantId, kinds],
    )) as RunRow[];
    return {
      lines: lines.map((line) => ({
        ...this.presentLine(line, Number(line.process_no)),
        runId: line.run_id,
        kind: line.kind,
        startedAt: new Date(line.started_at).toISOString(),
      })),
      page,
      pageSize,
      total: totalRows[0]?.count ?? 0,
      errorTypes: types.map((type) => ({
        code: type.error_code,
        label: labelOf(type.error_code),
        hint: type.hint ?? '',
        count: type.count,
      })),
      counts: tally,
      running: runningRows[0] ? this.presentRun(runningRows[0]) : null,
    };
  }

  async list(tenantId: string, kinds: ImportKind[]) {
    const rows = (await this.dataSource.query(
      `SELECT id, process_no, kind, status, total_count, processed_count, created_count, skipped_count, error_count, started_at, finished_at
       FROM integration_runs
       WHERE tenant_id = $1 AND kind = ANY($2::text[])
       ORDER BY process_no DESC
       LIMIT 30`,
      [tenantId, kinds],
    )) as RunRow[];
    return rows.map((row) => this.presentRun(row));
  }

  async getRun(runId: string, tenantId: string, processNo?: number) {
    const rows = (await this.dataSource.query(
      `SELECT id, process_no, kind, status, total_count, processed_count, created_count, skipped_count, error_count, started_at, finished_at
       FROM integration_runs WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId],
    )) as RunRow[];
    const row = rows[0];
    if (!row && processNo) {
      return this.presentRun({
        id: runId,
        process_no: processNo,
        kind: '',
        status: 'running',
        total_count: 0,
        processed_count: 0,
        created_count: 0,
        skipped_count: 0,
        error_count: 0,
        started_at: new Date().toISOString(),
        finished_at: null,
      });
    }
    if (!row) throw new DomainValidationError('Processo de migração não encontrado.');
    return this.presentRun(row);
  }

  async listLines(runId: string, tenantId: string, query: { status?: string; errorCode?: string; page?: number; pageSize?: number }) {
    const run = await this.getRun(runId, tenantId);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const page = Math.max(1, query.page ?? 1);
    const filters = ['run_id = $1', 'tenant_id = $2'];
    const params: Array<string | number> = [runId, tenantId];
    if (query.status === 'created' || query.status === 'skipped' || query.status === 'error' || query.status === 'pending') {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.errorCode) {
      params.push(query.errorCode);
      filters.push(`error_code = $${params.length}`);
    }
    const where = filters.join(' AND ');
    const totalRows = (await this.dataSource.query(
      `SELECT count(*)::int AS count FROM integration_run_lines WHERE ${where}`,
      params,
    )) as Array<{ count: number }>;
    const total = totalRows[0]?.count ?? 0;
    const lines = (await this.dataSource.query(
      `SELECT id, line_no, status, error_code, error_message, hint, payload, source_payload
       FROM integration_run_lines
       WHERE ${where}
       ORDER BY line_no
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as LineRow[];
    const types = (await this.dataSource.query(
      `SELECT error_code, max(hint) AS hint, count(*)::int AS count
       FROM integration_run_lines
       WHERE run_id = $1 AND tenant_id = $2 AND status = 'error' AND error_code IS NOT NULL
       GROUP BY error_code
       ORDER BY count DESC, error_code`,
      [runId, tenantId],
    )) as Array<{ error_code: string; hint: string | null; count: number }>;
    return {
      run,
      errorTypes: types.map((type) => ({
        code: type.error_code,
        label: labelOf(type.error_code),
        hint: type.hint ?? '',
        count: type.count,
      })),
      lines: lines.map((line) => this.presentLine(line, run.processNo)),
      page,
      pageSize,
      total,
    };
  }

  async saveLine(runId: string, lineId: string, tenantId: string, actorUserId: string, rows: ImportRow[]) {
    const line = await this.readLine(runId, lineId, tenantId);
    const run = await this.getRun(runId, tenantId);
    if (!isImportKind(run.kind)) throw new DomainValidationError('Layout de importação desconhecido.');
    const source = parsePayload(line.source_payload);
    await this.dataSource.query(
      `UPDATE integration_run_lines SET payload = $1::jsonb, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(rows), lineId, tenantId],
    );
    if (line.status === 'pending' || line.status === 'error') {
      return { message: 'Correção gravada. Reprocesse para integrar.' };
    }
    const message = await this.importService.applyAdjustment(run.kind, tenantId, actorUserId, source, rows);
    return { message };
  }

  async reprocessMatching(tenantId: string, actorUserId: string, kinds: ImportKind[], errorCode: string) {
    const runs = (await this.dataSource.query(
      `SELECT DISTINCT r.id
       FROM integration_runs r
       JOIN integration_run_lines l ON l.run_id = r.id
       WHERE r.tenant_id = $1 AND l.tenant_id = $1 AND r.kind = ANY($2::text[]) AND l.status = 'error' AND l.error_code = $3`,
      [tenantId, kinds, errorCode],
    )) as Array<{ id: string }>;
    for (const run of runs) {
      await this.reprocess(run.id, tenantId, actorUserId, { errorCode });
    }
    return { runs: runs.length };
  }

  async reprocess(runId: string, tenantId: string, actorUserId: string, input: { lineIds?: string[]; errorCode?: string }) {
    const filters = [`run_id = $1`, `tenant_id = $2`, `status = 'error'`];
    const params: string[] = [runId, tenantId];
    if (input.lineIds?.length) {
      params.push(...input.lineIds);
      filters.push(`id IN (${input.lineIds.map((_, index) => `$${index + 3}`).join(', ')})`);
    } else if (input.errorCode) {
      params.push(input.errorCode);
      filters.push(`error_code = $${params.length}`);
    }
    await this.dataSource.query(
      `UPDATE integration_run_lines
       SET status = 'pending', error_code = NULL, error_message = NULL, hint = NULL, updated_at = now()
       WHERE ${filters.join(' AND ')}`,
      params,
    );
    await this.refresh(runId, tenantId);
    this.kick(runId, tenantId, actorUserId);
    return this.getRun(runId, tenantId);
  }

  private kick(runId: string, tenantId: string, actorUserId: string) {
    if (this.active.has(runId)) return;
    this.active.add(runId);
    setImmediate(() => {
      void TenantContext.run({ tenantId, bypass: false }, async () => {
        try {
          await this.processPending(runId, tenantId, actorUserId);
        } catch (error) {
          console.error('A migração parou antes de concluir.', error);
        } finally {
          this.active.delete(runId);
          try {
            await this.refresh(runId, tenantId);
            const pending = (await this.dataSource.query(
              `SELECT count(*)::int AS count FROM integration_run_lines WHERE run_id = $1 AND tenant_id = $2 AND status = 'pending'`,
              [runId, tenantId],
            )) as Array<{ count: number }>;
            if ((pending[0]?.count ?? 0) > 0) this.kick(runId, tenantId, actorUserId);
          } catch (error) {
            console.error('A migração não atualizou o andamento.', error);
          }
        }
      });
    });
  }

  private async processPending(runId: string, tenantId: string, actorUserId: string) {
    const run = await this.getRun(runId, tenantId);
    if (!isImportKind(run.kind)) return;
    while (true) {
      const batch = (await this.dataSource.query(
        `SELECT id, line_no, status, error_code, error_message, hint, payload, source_payload
         FROM integration_run_lines
         WHERE run_id = $1 AND tenant_id = $2 AND status = 'pending'
         ORDER BY line_no
         LIMIT 25`,
        [runId, tenantId],
      )) as LineRow[];
      if (batch.length === 0) break;
      for (const line of batch) {
        await this.processLine(run.kind, tenantId, actorUserId, line);
        await this.refresh(runId, tenantId);
      }
    }
  }

  private async processLine(kind: ImportKind, tenantId: string, actorUserId: string, line: LineRow) {
    try {
      const outcome = await this.importService.executeUnit(kind, tenantId, actorUserId, parsePayload(line.payload));
      await this.dataSource.query(
        `UPDATE integration_run_lines
         SET status = $1, error_code = NULL, error_message = NULL, hint = $2, updated_at = now()
         WHERE id = $3 AND tenant_id = $4`,
        [outcome.status, outcome.notices.length > 0 ? outcome.notices.join(' ') : null, line.id, tenantId],
      );
    } catch (error) {
      if (isAlreadyExists(error)) {
        await this.dataSource.query(
          `UPDATE integration_run_lines
           SET status = 'skipped', error_code = NULL, error_message = NULL, hint = 'Já estava no cadastro.', updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [line.id, tenantId],
        );
        return;
      }
      const message = error instanceof Error ? error.message : 'Não foi possível gravar esta linha.';
      const classified = classifyImportError(message);
      await this.dataSource.query(
        `UPDATE integration_run_lines
         SET status = 'error', error_code = $1, error_message = $2, hint = $3, updated_at = now()
         WHERE id = $4 AND tenant_id = $5`,
        [classified.code, message, classified.hint, line.id, tenantId],
      );
    }
  }

  private async refresh(runId: string, tenantId: string) {
    const counts = (await this.dataSource.query(
      `SELECT status, count(*)::int AS count FROM integration_run_lines WHERE run_id = $1 AND tenant_id = $2 GROUP BY status`,
      [runId, tenantId],
    )) as Array<{ status: LineStatus; count: number }>;
    const tally = { pending: 0, created: 0, skipped: 0, error: 0 };
    for (const row of counts) tally[row.status] = row.count;
    const total = tally.pending + tally.created + tally.skipped + tally.error;
    const processed = total - tally.pending;
    await this.dataSource.query(
      `UPDATE integration_runs
       SET status = $2::varchar, total_count = $3, processed_count = $4, created_count = $5, skipped_count = $6, error_count = $7,
           finished_at = CASE WHEN $2::varchar = 'completed' THEN COALESCE(finished_at, now()) ELSE NULL END,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $8`,
      [runId, tally.pending === 0 ? 'completed' : 'running', total, processed, tally.created, tally.skipped, tally.error, tenantId],
    );
  }

  private async readLine(runId: string, lineId: string, tenantId: string) {
    const rows = (await this.dataSource.query(
      `SELECT id, line_no, status, error_code, error_message, hint, payload, source_payload
       FROM integration_run_lines WHERE id = $1 AND run_id = $2 AND tenant_id = $3`,
      [lineId, runId, tenantId],
    )) as LineRow[];
    if (!rows[0]) throw new DomainValidationError('Linha da migração não encontrada.');
    return rows[0];
  }

  private presentRun(row: RunRow) {
    const startedAt = new Date(row.started_at).toISOString();
    const finishedAt = row.finished_at ? new Date(row.finished_at).toISOString() : null;
    const progress = describeRunProgress({
      status: row.status,
      total: Number(row.total_count),
      processed: Number(row.processed_count),
      startedAt,
      finishedAt,
    });
    return {
      id: row.id,
      processNo: Number(row.process_no),
      kind: row.kind,
      ...progress,
      created: Number(row.created_count),
      skipped: Number(row.skipped_count),
      errors: Number(row.error_count),
      startedAt,
      finishedAt,
    };
  }

  private presentLine(line: LineRow, processNo: number) {
    const payload = parsePayload(line.payload);
    const notice = line.hint && line.status !== 'error' && line.hint.includes('não pode ser alterad') ? line.hint : null;
    return {
      id: line.id,
      processNo,
      lineNo: line.line_no,
      status: line.status,
      errorCode: line.error_code,
      message: notice ?? (line.status === 'error' ? line.error_message ?? 'Erro na linha.' : line.status === 'skipped' ? 'Já estava no cadastro.' : line.status === 'created' ? 'Integrado.' : 'Na fila.'),
      hint: notice ? 'O registro permanece como está para manter a integridade e a auditoria.' : line.hint ?? (line.status === 'created' ? 'Integrado.' : line.status === 'skipped' ? 'Já estava no cadastro.' : ''),
      payload,
    };
  }
}

function parsePayload(value: ImportRow[] | string): ImportRow[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as ImportRow[];
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function labelOf(code: string) {
  if (code.startsWith('preencha:')) {
    const field = code.slice('preencha:'.length);
    return `Preencha ${field.charAt(0).toLocaleUpperCase('pt-BR')}${field.slice(1)}`;
  }
  const known: Record<string, string> = {
    'cliente-ausente': 'Cliente não encontrado',
    'produto-ausente': 'Produto não encontrado',
    'servico-ausente': 'Serviço não encontrado',
    'parte-ausente': 'Parte do corpo não encontrada',
    'unidade-ausente': 'Unidade não encontrada',
    'filial-ausente': 'Filial não encontrada',
    'atendente-ausente': 'Atendente não encontrado',
    'empresa-ausente': 'Empresa não encontrada',
    'papel-ausente': 'Papel não encontrado',
    cep: 'CEP inválido',
    quantidade: 'Quantidade inválida',
    senha: 'Senha inválida',
    retirada: 'Retirada sem data',
    'numero-antigo': 'Número antigo vazio',
    pecas: 'Mais de 5 peças',
    tempo: 'Tempo previsto inválido',
    grau: 'Grau inválido',
    'tipo-cliente': 'Tipo de cliente inválido',
    'status-cliente': 'Status de cliente inválido',
    pagamento: 'Forma de pagamento inválida',
    modalidade: 'Modalidade do cartão inválida',
    entrega: 'Tipo de entrega inválido',
    valor: 'Valor inválido',
    outro: 'Outro erro',
  };
  return known[code] ?? 'Outro erro';
}
