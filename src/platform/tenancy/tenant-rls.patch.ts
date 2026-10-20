import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { TenantContext } from './tenant-context';

const SETTER_SQL = 'SELECT set_config($1, $2, false)';
const appliedOnConnection = new WeakMap<object, string>();

let patched = false;

async function connectionOf(runner: PostgresQueryRunner): Promise<object | null> {
  try {
    const connected = await (runner as unknown as { connect: () => Promise<unknown> }).connect();
    return connected && typeof connected === 'object' ? connected : null;
  } catch {
    return null;
  }
}

function contextKey(): string {
  const context = TenantContext.get();
  if (context.bypass || !context.tenantId) {
    return 'bypass';
  }
  return `tenant:${context.tenantId}`;
}

function isInternalConfigQuery(query: string): boolean {
  const normalized = query.trim().toUpperCase();
  return (
    normalized.startsWith('SELECT SET_CONFIG') ||
    normalized.startsWith('SET ') ||
    normalized.startsWith('RESET ') ||
    normalized.startsWith('DISCARD ')
  );
}

export function patchPostgresQueryRunnerForRls(): void {
  if (patched) {
    return;
  }
  patched = true;

  const originalQuery = PostgresQueryRunner.prototype.query;
  PostgresQueryRunner.prototype.query = async function patchedQuery(
    this: PostgresQueryRunner,
    query: string,
    parameters?: any[],
    useStructuredResult?: boolean,
  ) {
    if (!isInternalConfigQuery(query)) {
      const key = contextKey();
      const connection = await connectionOf(this);
      if (!connection || appliedOnConnection.get(connection) !== key) {
        const context = TenantContext.get();
        try {
          if (context.bypass || !context.tenantId) {
            await originalQuery.call(this, 'RESET ROLE', undefined, false);
            await originalQuery.call(this, SETTER_SQL, ['app.rls_bypass', 'on'], false);
            await originalQuery.call(this, SETTER_SQL, ['app.current_tenant_id', ''], false);
          } else {
            await originalQuery.call(this, SETTER_SQL, ['app.rls_bypass', 'off'], false);
            await originalQuery.call(this, SETTER_SQL, ['app.current_tenant_id', context.tenantId], false);
            await originalQuery.call(this, 'SET ROLE anexsys_app', undefined, false);
          }
          if (connection) {
            appliedOnConnection.set(connection, key);
          }
        } catch {
          // Banco ainda sem o papel / as políticas (migração antiga): segue sem bloquear.
        }
      }
    }

    return originalQuery.call(this, query, parameters, useStructuredResult);
  };
}
