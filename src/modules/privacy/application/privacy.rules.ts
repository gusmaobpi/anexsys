export const PRIVACY_NOTICE_DEFAULT =
  'O ateliê guarda os dados desta ordem de serviço para executar o serviço, avisar sobre o andamento e cumprir prazos legais. Você pode pedir acesso, correção ou exclusão pelo ateliê. Este texto ainda pode ser ajustado.';

export const PRIVACY_ACCEPTANCE_DEFAULT =
  'Concordo com o serviço e o preço desta OS. Aceito a confirmação eletrônica neste link como comprovante. Li o aviso de privacidade.';

export const PRIVACY_OPERATOR_DEFAULT =
  'O ateliê é o controlador dos dados dos clientes. O ANEXSYS é o operador e trata esses dados só para executar o serviço pedido pelo ateliê. Este texto é um rascunho e precisa de revisão de advogado antes da virada.';

export const PRIVACY_INCIDENT_PLAN_DEFAULT =
  'Se houver vazamento ou acesso indevido: isole o que foi exposto, anote o que aconteceu e quando, avise o responsável da Conta e registre o incidente nesta tela. Se houver risco aos clientes, o controlador comunica a autoridade e os titulares. O prazo e o texto definitivo dependem da revisão do advogado.';

export const LINK_MARGIN_DAYS_DEFAULT = 30;
export const RETENTION_INACTIVE_YEARS_DEFAULT = 5;
export const ADDRESS_RETENTION_DAYS_DEFAULT = 30;
export const SUBJECT_RESPONSE_DAYS_DEFAULT = 15;

export const SUBJECT_REQUEST_TYPES = ['access', 'correction', 'anonymization', 'deletion', 'portability'] as const;
export type SubjectRequestType = (typeof SUBJECT_REQUEST_TYPES)[number];

export const PROCESSING_ACTIVITIES = [
  {
    code: 'customer',
    title: 'Cadastro do cliente',
    dataCategories: 'Nome, WhatsApp, e-mail, documento opcional, endereço e medidas',
    purpose: 'Identificar o cliente, executar o serviço e cumprir a garantia',
    legalBasis: 'Execução do contrato. O aviso por WhatsApp só sai com consentimento registrado.',
    storage: 'Cadastro de clientes da Conta',
  },
  {
    code: 'service-order',
    title: 'Ordem de serviço',
    dataCategories: 'Peças, serviços, valores, fotos da peça e observações',
    purpose: 'Registrar o combinado, produzir e cobrar',
    legalBasis: 'Execução do contrato',
    storage: 'Ordens de serviço da Conta',
  },
  {
    code: 'public-link',
    title: 'Link público da OS',
    dataCategories: 'Primeiro nome, número da OS, status, serviços e situação do pagamento',
    purpose: 'O cliente acompanha e aceita o combinado sem login',
    legalBasis: 'Execução do contrato',
    storage: 'Página pública da OS, sem indexação',
  },
  {
    code: 'whatsapp',
    title: 'Avisos ao cliente',
    dataCategories: 'Número de WhatsApp e o texto das duas mensagens',
    purpose: 'Avisar a abertura da OS e quando a peça está pronta',
    legalBasis: 'Consentimento registrado no cadastro',
    storage: 'Fila de avisos da Conta. A Meta recebe o número quando a API estiver ativa.',
  },
  {
    code: 'production',
    title: 'Produção e diário',
    dataCategories: 'Nome de quem produziu, horário e descrição do serviço',
    purpose: 'Controlar a sacola e o diário de bordo',
    legalBasis: 'Execução do contrato de trabalho ou de prestação com a equipe',
    storage: 'Diário de bordo da Conta',
  },
  {
    code: 'payment',
    title: 'Pagamento',
    dataCategories: 'Valor, forma, data e, na maquininha, o resultado da transação. Sem número de cartão.',
    purpose: 'Quitar a OS',
    legalBasis: 'Execução do contrato',
    storage: 'Financeiro da Conta e, quando houver, a operadora da maquininha',
  },
] as const;

export function todayInBrasilia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addCalendarDays(dateOnly: string, days: number): string {
  const iso = dateOnly.slice(0, 10);
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function publicLinkExpiry(input: {
  status: string;
  actualPickupDate: string | null;
  warrantyDays: number;
  marginDays: number;
  today: string;
}): { expiresOn: string | null; expired: boolean } {
  if (input.status !== 'picked_up' || !input.actualPickupDate) {
    return { expiresOn: null, expired: false };
  }
  const warrantyDays = Number.isInteger(input.warrantyDays) && input.warrantyDays > 0 ? input.warrantyDays : 90;
  const marginDays = Number.isInteger(input.marginDays) && input.marginDays >= 0 ? input.marginDays : LINK_MARGIN_DAYS_DEFAULT;
  const expiresOn = addCalendarDays(input.actualPickupDate, warrantyDays + marginDays);
  return { expiresOn, expired: input.today > expiresOn };
}

export function subjectRequestTypeLabel(type: string): string {
  if (type === 'access') return 'Acesso';
  if (type === 'correction') return 'Correção';
  if (type === 'anonymization') return 'Anonimização';
  if (type === 'deletion') return 'Exclusão';
  if (type === 'portability') return 'Portabilidade';
  return type;
}
