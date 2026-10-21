export type GradeCollaborator = { technicianId: string; displayName: string };
export type GradePeriodDay = { workDate: string; collaborators: GradeCollaborator[] };
export type GradePeriod = { id: string; from: string; to: string; days: GradePeriodDay[] };

export function formatGradeDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return iso;
  }
  return `${day}/${month}/${year}`;
}

export function gradePeriodLabel(period: Pick<GradePeriod, "from" | "to">) {
  return `${formatGradeDate(period.from)} – ${formatGradeDate(period.to)}`;
}

export function gradeCollaboratorLines(period: GradePeriod) {
  return period.days.map(
    (day) => `${formatGradeDate(day.workDate)} — ${day.collaborators.map((person) => person.displayName).join(", ")}`,
  );
}

export function gradeCollaboratorText(period: GradePeriod) {
  const lines = gradeCollaboratorLines(period);
  return lines.length > 0 ? lines.join(" · ") : "Nenhum colaborador marcado.";
}

export function applyFloorGradeFilters(records: GradePeriod[], filters: Record<string, string>) {
  const query = (filters.q ?? "").trim().toLowerCase();
  const collaborator = (filters.collaborator ?? "").trim().toLowerCase();
  return records.filter((record) => {
    const text = `${gradePeriodLabel(record)} ${gradeCollaboratorText(record)}`.toLowerCase();
    if (query && !text.includes(query)) {
      return false;
    }
    if (collaborator && !gradeCollaboratorText(record).toLowerCase().includes(collaborator)) {
      return false;
    }
    return true;
  });
}

function csvCell(value: string) {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildFloorGradeExcelCsv(records: GradePeriod[]) {
  const header = ["Data início", "Data fim", "Colaboradores"];
  const rows = records.map((record) => [formatGradeDate(record.from), formatGradeDate(record.to), gradeCollaboratorText(record)]);
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(";")).join("\n");
}
