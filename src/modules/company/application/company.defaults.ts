export const DEFAULT_BRANCH_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_BRANCH_CODE = 'MATRIZ';
export const DEFAULT_BRANCH_DISPLAY_NAME = 'Matriz';

export function defaultBranchFallbackCode(companyId: string): string {
  const suffix = companyId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${DEFAULT_BRANCH_CODE}-${suffix}`;
}

export type WeekdayHoursInput = {
  weekday: number;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  cutoffAt: string | null;
};

export function defaultOperatingHours(): WeekdayHoursInput[] {
  return [
    { weekday: 0, isOpen: false, opensAt: null, closesAt: null, cutoffAt: null },
    { weekday: 1, isOpen: true, opensAt: '09:30', closesAt: '18:00', cutoffAt: '18:00' },
    { weekday: 2, isOpen: true, opensAt: '09:30', closesAt: '18:00', cutoffAt: '18:00' },
    { weekday: 3, isOpen: true, opensAt: '09:30', closesAt: '18:00', cutoffAt: '18:00' },
    { weekday: 4, isOpen: true, opensAt: '09:30', closesAt: '18:00', cutoffAt: '18:00' },
    { weekday: 5, isOpen: true, opensAt: '09:30', closesAt: '18:00', cutoffAt: '18:00' },
    { weekday: 6, isOpen: true, opensAt: '09:30', closesAt: '14:00', cutoffAt: '14:00' },
  ];
}

export const PILOT_MODULE_CODES = [
  { code: 'identity', displayName: 'Acesso', enabled: true },
  { code: 'customers', displayName: 'Clientes', enabled: true },
  { code: 'service_orders', displayName: 'Ordens de serviço', enabled: true },
  { code: 'production', displayName: 'Produção', enabled: true },
  { code: 'quality', displayName: 'Qualidade', enabled: true },
  { code: 'finance', displayName: 'Financeiro', enabled: false },
  { code: 'whatsapp', displayName: 'WhatsApp', enabled: false },
  { code: 'concierge', displayName: 'Concierge', enabled: false },
] as const;

export const ATELIER_ROLES = [
  {
    code: 'RECEPCAO',
    displayName: 'Recepção',
    description: 'Recebe o cliente e consulta OS.',
    permissions: ['customers.read', 'service_orders.read', 'branches.read'],
  },
  {
    code: 'ATENDENTE',
    displayName: 'Atendente / medidor',
    description: 'Abre OS, cadastra cliente e registra medidas.',
    permissions: [
      'customers.read',
      'customers.write',
      'measurements.read',
      'measurements.write',
      'service_orders.read',
      'service_orders.write',
      'branches.read',
    ],
  },
  {
    code: 'PRODUCAO',
    displayName: 'Produção',
    description: 'Executa a Ordem de Produção.',
    permissions: ['production_orders.read', 'production_orders.write', 'service_orders.read'],
  },
  {
    code: 'QUALIDADE',
    displayName: 'Qualidade',
    description: 'Revisa e reprova peças.',
    permissions: [
      'quality.read',
      'quality.write',
      'rework.read',
      'rework.write',
      'production_orders.read',
      'service_orders.read',
    ],
  },
  {
    code: 'GERENTE',
    displayName: 'Gerente',
    description: 'Administra a Conta, Empresas, Filiais e usuários (sem criar novas Contas).',
    permissions: [
      'tenants.read',
      'tenants.write',
      'companies.read',
      'companies.write',
      'branches.read',
      'branches.write',
      'users.read',
      'users.write',
      'roles.read',
      'roles.write',
      'permissions.read',
      'customers.read',
      'customers.write',
      'measurements.read',
      'measurements.write',
      'service_orders.read',
      'service_orders.write',
      'production_orders.read',
      'production_orders.write',
      'quality.read',
      'quality.write',
      'floor_schedule.write',
      'finance.read',
      'finance.write',
    ],
  },
] as const;
