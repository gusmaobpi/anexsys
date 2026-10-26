import { cell, type ImportKind, type ImportRow } from './integration-import.rules';

export type RunStatus = 'running' | 'completed';
export type LineStatus = 'pending' | 'created' | 'skipped' | 'error';

export type ImportErrorType = {
  code: string;
  label: string;
  hint: string;
};

const ERROR_RULES: Array<{ test: RegExp; code: string; label: string; hint: string }> = [
  { test: /não está no cadastro|importe os clientes/i, code: 'cliente-ausente', label: 'Cliente não encontrado', hint: 'Importe o cadastro de clientes com este código e reprocesse.' },
  { test: /produto não encontrado/i, code: 'produto-ausente', label: 'Produto não encontrado', hint: 'Importe o cadastro de produtos com este nome e reprocesse.' },
  { test: /serviço não encontrado/i, code: 'servico-ausente', label: 'Serviço não encontrado', hint: 'Importe o cadastro de serviços com este nome e reprocesse.' },
  { test: /parte do corpo não encontrada/i, code: 'parte-ausente', label: 'Parte do corpo não encontrada', hint: 'Importe as partes do corpo e reprocesse.' },
  { test: /unidade não encontrada/i, code: 'unidade-ausente', label: 'Unidade não encontrada', hint: 'Importe as unidades de medida e reprocesse.' },
  { test: /filial não encontrada/i, code: 'filial-ausente', label: 'Filial não encontrada', hint: 'Cadastre a filial com este nome e reprocesse.' },
  { test: /atendente não encontrado/i, code: 'atendente-ausente', label: 'Atendente não encontrado', hint: 'Importe os usuários com este e-mail e reprocesse.' },
  { test: /empresa não encontrada/i, code: 'empresa-ausente', label: 'Empresa não encontrada', hint: 'Confira o nome da empresa e reprocesse.' },
  { test: /papel não encontrado/i, code: 'papel-ausente', label: 'Papel não encontrado', hint: 'Use Recepção, Atendente, Produção, Qualidade ou Gerente.' },
  { test: /cep/i, code: 'cep', label: 'CEP inválido', hint: 'Corrija o CEP em Detalhar e reprocesse.' },
  { test: /quantidade/i, code: 'quantidade', label: 'Quantidade inválida', hint: 'A quantidade precisa ser maior que zero.' },
  { test: /senha inicial/i, code: 'senha', label: 'Senha inválida', hint: 'A senha inicial precisa ter no mínimo 8 caracteres.' },
  { test: /data da retirada/i, code: 'retirada', label: 'Retirada sem data', hint: 'Preencha a data da retirada e reprocesse.' },
  { test: /número no sistema antigo/i, code: 'numero-antigo', label: 'Número antigo vazio', hint: 'Preencha o número no sistema antigo e reprocesse.' },
  { test: /máximo 5 peças|maximo 5 peças/i, code: 'pecas', label: 'Mais de 5 peças', hint: 'Divida a ordem. Cada ordem aceita no máximo 5 peças.' },
  { test: /tempo previsto/i, code: 'tempo', label: 'Tempo previsto inválido', hint: 'Informe os minutos como número inteiro maior que zero.' },
  { test: /grau de dificuldade/i, code: 'grau', label: 'Grau inválido', hint: 'Use 1, 2, 3 ou 4, ou deixe vazio.' },
  { test: /tipo de cliente/i, code: 'tipo-cliente', label: 'Tipo de cliente inválido', hint: 'Use Pessoa ou Empresa.' },
  { test: /status do cliente/i, code: 'status-cliente', label: 'Status de cliente inválido', hint: 'Use Ativo, Inativo ou Bloqueado.' },
  { test: /forma de pagamento/i, code: 'pagamento', label: 'Forma de pagamento inválida', hint: 'Use Dinheiro, Cartão, Pix, Transferência ou Outro.' },
  { test: /modalidade do cartão/i, code: 'modalidade', label: 'Modalidade do cartão inválida', hint: 'Use Crédito, Débito, Pix ou Voucher.' },
  { test: /tipo de entrega/i, code: 'entrega', label: 'Tipo de entrega inválido', hint: 'Use Normal, Expresso ou Urgente.' },
  { test: /valor inválido/i, code: 'valor', label: 'Valor inválido', hint: 'Use número com vírgula, como 80,00.' },
];

export function classifyImportError(message: string): ImportErrorType {
  const text = message.trim();
  const missing = text.match(/^Preencha (.+)\.$/);
  if (missing) {
    const field = missing[1];
    return {
      code: `preencha:${field.toLocaleLowerCase('pt-BR')}`,
      label: `Preencha ${field}`,
      hint: 'Corrija o campo em Detalhar e reprocesse.',
    };
  }
  const known = ERROR_RULES.find((rule) => rule.test.test(text));
  if (known) return { code: known.code, label: known.label, hint: known.hint };
  return {
    code: 'outro',
    label: 'Outro erro',
    hint: 'Corrija o campo em Detalhar e reprocesse.',
  };
}

export function describeRunProgress(input: {
  status: RunStatus;
  total: number;
  processed: number;
  startedAt: string;
  finishedAt: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const total = Math.max(0, input.total);
  const processed = Math.min(total, Math.max(0, input.processed));
  const remaining = total - processed;
  const percent = total === 0 ? 100 : Math.round((processed / total) * 100);
  let finishAt = input.finishedAt;
  if (input.status === 'running' && processed > 0 && remaining > 0) {
    const elapsed = Math.max(now - new Date(input.startedAt).getTime(), 1);
    finishAt = new Date(now + (elapsed / processed) * remaining).toISOString();
  }
  return { percent, remaining, total, processed, finishAt, status: input.status };
}

export function buildImportUnits(kind: ImportKind, rows: ImportRow[]) {
  const filled = rows.filter((row) => Object.entries(row).some(([key, value]) => key !== '__line' && String(value ?? '').trim()));
  const groups = new Map<string, ImportRow[]>();
  if (kind === 'measurements') {
    for (const row of filled) {
      const key = `${cell(row, 'Código do cliente no sistema antigo')}|${cell(row, 'Data da medição')}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
  } else if (kind === 'service-orders') {
    for (const row of filled) {
      const key = cell(row, 'Número no sistema antigo') || `linha-${row.__line ?? groups.size + 1}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
  } else {
    filled.forEach((row, index) => groups.set(String(row.__line ?? index), [row]));
  }
  return [...groups.values()].map((payload) => ({
    lineNo: payload[0]?.__line ?? 0,
    payload,
  }));
}
