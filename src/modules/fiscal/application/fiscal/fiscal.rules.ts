const COMPLETED = new Set(["ready_for_pickup", "picked_up"]);

export type FiscalCheck = {
  status: string;
  paymentStatus: string;
  alreadyIssued: boolean;
  customerDocument: string | null;
  customerStreet: string | null;
  customerCity: string | null;
  customerState: string | null;
  missingServiceCodes: string[];
  certificateReady: boolean;
  settingsReady: boolean;
  environment: "homologation" | "production" | null;
};

export function fiscalBlockers(input: FiscalCheck): string[] {
  const blockers: string[] = [];
  if (!COMPLETED.has(input.status)) blockers.push("A OS ainda não está concluída.");
  if (input.paymentStatus !== "paid") blockers.push("A OS não está quitada.");
  if (input.alreadyIssued) blockers.push("A nota desta OS já foi emitida.");
  if (!digits(input.customerDocument)) blockers.push("Cliente sem CPF/CNPJ.");
  if (!input.customerStreet?.trim() || !input.customerCity?.trim() || !input.customerState?.trim()) {
    blockers.push("Cliente sem endereço.");
  }
  if (input.missingServiceCodes.length > 0) blockers.push("Serviço sem código fiscal.");
  if (!input.settingsReady) blockers.push("A filial não tem configuração fiscal.");
  if (!input.certificateReady) blockers.push("Certificado inválido.");
  if (!input.environment) blockers.push("Escolha o ambiente fiscal da filial.");
  return blockers;
}

export function certificateAlertDays(expiresAt: Date, now: Date): number | null {
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return 0;
  for (const mark of [7, 15, 30, 60, 90]) {
    if (daysLeft <= mark) return mark;
  }
  return null;
}

export function paidStatus(total: number, paid: number): "paid" | "partial" | "pending" {
  if (total <= 0 || paid + 0.009 >= total) return "paid";
  if (paid > 0) return "partial";
  return "pending";
}

function digits(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}
