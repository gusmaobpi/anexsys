export type CompanyRecord = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  status: "active" | "inactive";
  warrantyAdjustmentPeriodDays: number;
  warrantyExecutionPeriodDays: number;
  blockDeliveryWithOutstandingBalance: boolean;
  delayAlertLeadHours: number;
  grade1Minutes: number;
  grade2Minutes: number;
  grade3Minutes: number;
  grade4Minutes: number;
};

export type CompanyApiRecord = Partial<CompanyRecord> & {
  code?: string;
  legalName?: string;
  displayName?: string;
};

export function normalizeCompanyRecord(
  record: CompanyApiRecord,
  index: number,
  options?: { fallbackId?: string },
): CompanyRecord {
  const code = record.code?.trim() || `TENANT-${index + 1}`;
  const legalName = record.legalName?.trim() || code;
  const displayName = record.displayName?.trim() || legalName;

  return {
    id: record.id?.trim() || options?.fallbackId || code,
    code,
    legalName,
    displayName,
    status: record.status === "inactive" ? "inactive" : "active",
    warrantyAdjustmentPeriodDays: record.warrantyAdjustmentPeriodDays ?? 7,
    warrantyExecutionPeriodDays: record.warrantyExecutionPeriodDays ?? 90,
    blockDeliveryWithOutstandingBalance: record.blockDeliveryWithOutstandingBalance ?? true,
    delayAlertLeadHours: record.delayAlertLeadHours ?? 2,
    grade1Minutes: record.grade1Minutes ?? 30,
    grade2Minutes: record.grade2Minutes ?? 60,
    grade3Minutes: record.grade3Minutes ?? 90,
    grade4Minutes: record.grade4Minutes ?? 180,
  };
}

export function normalizeCompanyListRecords(records: CompanyApiRecord[]): CompanyRecord[] {
  return records.map((record, index) => normalizeCompanyRecord(record, index));
}

export function resolveActiveCompanyId(
  companies: CompanyRecord[],
  activeCompanyId: string | null,
  activeCompanyCode: string | null,
): string | null {
  if (activeCompanyId && companies.some((company) => company.id === activeCompanyId)) {
    return activeCompanyId;
  }

  if (activeCompanyCode) {
    const matchingCompany = companies.find((company) => company.code === activeCompanyCode);
    if (matchingCompany) {
      return matchingCompany.id;
    }
  }

  return companies[0]?.id ?? null;
}
