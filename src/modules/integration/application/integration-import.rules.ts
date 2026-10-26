import { CustomerStatus, CustomerType, DeliveryType, PaymentMethod, PaymentModality, ServiceOrderStatus } from 'src/shared/domain/enums';
import { DomainValidationError } from 'src/shared/errors/domain-validation.error';

export const IMPORT_KINDS = [
  'body-parts',
  'units',
  'products',
  'services',
  'prices',
  'minute-rates',
  'users',
  'customers',
  'measurements',
  'service-orders',
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number];

export function isImportKind(value: string): value is ImportKind {
  return (IMPORT_KINDS as readonly string[]).includes(value);
}

export function importPermission(kind: ImportKind) {
  if (kind === 'users') return 'users.write';
  if (kind === 'customers') return 'customers.write';
  if (kind === 'body-parts' || kind === 'units' || kind === 'measurements') return 'measurements.write';
  return 'service_orders.write';
}

export type ImportRow = {
  __line?: number;
  [key: string]: string | number | undefined;
};

export function cell(row: ImportRow, header: string) {
  return String(row[header] ?? "").trim();
}

export function requireCell(row: ImportRow, header: string) {
  const value = cell(row, header);
  if (!value) {
    throw new DomainValidationError(`Preencha ${header}.`);
  }
  return value;
}

export function parseMoney(value: string) {
  const text = value.trim();
  if (!text) return 0;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DomainValidationError(`Valor inválido: ${value}.`);
  }
  return amount;
}

export function parseOptionalGrade(value: string) {
  if (!value.trim()) return null;
  const grade = Number(value);
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
    throw new DomainValidationError('O grau de dificuldade fica entre 1 e 4.');
  }
  return grade;
}

export function mapCustomerType(value: string): CustomerType {
  const text = value.trim().toLowerCase();
  if (text === 'empresa') return CustomerType.COMPANY;
  if (text === 'pessoa') return CustomerType.PERSON;
  throw new DomainValidationError('Tipo de cliente: Pessoa ou Empresa.');
}

export function mapCustomerStatus(value: string): CustomerStatus {
  const text = value.trim().toLowerCase();
  if (text === 'ativo') return CustomerStatus.ACTIVE;
  if (text === 'inativo') return CustomerStatus.INACTIVE;
  if (text === 'bloqueado') return CustomerStatus.BLOCKED;
  throw new DomainValidationError('Status do cliente: Ativo, Inativo ou Bloqueado.');
}

export function mapYesNo(value: string, label: string) {
  const text = value.trim().toLowerCase();
  if (text === 'sim') return true;
  if (text === 'não' || text === 'nao') return false;
  throw new DomainValidationError(`${label}: Sim ou Não.`);
}

export function mapDeliveryType(value: string): DeliveryType {
  const text = value.trim().toLowerCase();
  if (text === 'normal') return DeliveryType.STANDARD;
  if (text === 'expresso') return DeliveryType.EXPRESS;
  if (text === 'urgente') return DeliveryType.PRIORITY;
  throw new DomainValidationError('Tipo de entrega: Normal, Expresso ou Urgente.');
}

export function mapServiceOrderStatus(value: string): ServiceOrderStatus {
  const text = value.trim().toLowerCase();
  const mapped: Record<string, ServiceOrderStatus> = {
    aberta: ServiceOrderStatus.OPEN,
    aprovada: ServiceOrderStatus.APPROVED,
    cancelada: ServiceOrderStatus.CANCELLED,
    'em produção': ServiceOrderStatus.IN_PRODUCTION,
    'em producao': ServiceOrderStatus.IN_PRODUCTION,
    'aguardando prova': ServiceOrderStatus.AWAITING_PROOF,
    'aguardando controle de qualidade': ServiceOrderStatus.AWAITING_QUALITY,
    'controle de qualidade': ServiceOrderStatus.QUALITY,
    'em refação': ServiceOrderStatus.IN_REWORK,
    'em refacao': ServiceOrderStatus.IN_REWORK,
    'pronto para retirada': ServiceOrderStatus.READY_FOR_PICKUP,
    retirado: ServiceOrderStatus.PICKED_UP,
  };
  const status = mapped[text];
  if (!status) {
    throw new DomainValidationError(`Status desconhecido: ${value}.`);
  }
  return status;
}

export function mapRoleCode(value: string) {
  const text = value.trim().toLowerCase();
  const mapped: Record<string, string> = {
    recepção: 'RECEPCAO',
    recepcao: 'RECEPCAO',
    atendente: 'ATENDENTE',
    produção: 'PRODUCAO',
    producao: 'PRODUCAO',
    qualidade: 'QUALIDADE',
    gerente: 'GERENTE',
  };
  const code = mapped[text];
  if (!code) {
    throw new DomainValidationError('Papel: Recepção, Atendente, Produção, Qualidade ou Gerente.');
  }
  return code;
}

export function mapPaymentMethod(value: string): PaymentMethod | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const mapped: Record<string, PaymentMethod> = {
    dinheiro: PaymentMethod.CASH,
    cartão: PaymentMethod.CARD,
    cartao: PaymentMethod.CARD,
    pix: PaymentMethod.PIX,
    transferência: PaymentMethod.BANK_TRANSFER,
    transferencia: PaymentMethod.BANK_TRANSFER,
    outro: PaymentMethod.OTHER,
  };
  const method = mapped[text];
  if (!method) {
    throw new DomainValidationError('Forma de pagamento: Dinheiro, Cartão, Pix, Transferência ou Outro.');
  }
  return method;
}

export function mapPaymentModality(value: string): PaymentModality | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const mapped: Record<string, PaymentModality> = {
    crédito: PaymentModality.CREDIT,
    credito: PaymentModality.CREDIT,
    débito: PaymentModality.DEBIT,
    debito: PaymentModality.DEBIT,
    pix: PaymentModality.PIX,
    voucher: PaymentModality.VOUCHER,
  };
  const modality = mapped[text];
  if (!modality) {
    throw new DomainValidationError('Modalidade do cartão: Crédito, Débito, Pix ou Voucher.');
  }
  return modality;
}

export function linkedToServiceOrderMessage(record: 'Produto' | 'Serviço' | 'Preço' | 'Cliente' | 'Atendente' | 'Medida') {
  if (record === 'Medida') {
    return 'Medida não pode ser alterada porque já está vinculada a Ordem de Serviço';
  }
  return `${record} não pode ser alterado porque já está vinculado a Ordem de Serviço`;
}

export function linkedToMeasurementSheetMessage(record: 'Parte do corpo' | 'Unidade') {
  return `${record} não pode ser alterada porque já está vinculada a uma ficha de medidas`;
}

export function isAlreadyExists(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /já existe|already exists/i.test(message);
}

export function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase('pt-BR') === right.trim().toLocaleLowerCase('pt-BR');
}
