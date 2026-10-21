export const DEFAULT_GRADE_MINUTES = [30, 60, 90, 180] as const;
export const DEFAULT_DELAY_LEAD_HOURS = 2;

const DELAY_EXCLUDED = new Set(['ready_for_pickup', 'picked_up', 'cancelled']);

export type DelayKind = 'soon' | 'late';

export function closingTime(dateIso: string): string {
  const weekday = new Date(`${dateIso.slice(0, 10)}T12:00:00-03:00`).getUTCDay();
  return weekday === 6 ? '14:00' : '18:00';
}

export function deadlineInstant(dateIso: string, time: string | null | undefined): Date {
  const clock = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : closingTime(dateIso);
  return new Date(`${dateIso.slice(0, 10)}T${clock}:00-03:00`);
}

export function delayKind(status: string, deadline: Date, now: Date, leadHours: number): DelayKind | null {
  if (DELAY_EXCLUDED.has(status)) {
    return null;
  }
  const delta = deadline.getTime() - now.getTime();
  if (delta < 0) {
    return 'late';
  }
  if (delta <= leadHours * 60 * 60 * 1000) {
    return 'soon';
  }
  return null;
}

export function gradeMinutes(minutes: number[], grade: number | null): number | null {
  if (!grade || grade < 1 || grade > minutes.length) {
    return null;
  }
  const value = minutes[grade - 1];
  return Number.isFinite(value) ? value : null;
}

export type ProductionFinish = {
  userId: string;
  displayName: string;
  serviceOrderId: string;
  orderNo: string;
  difficultyGrade: number | null;
  pieces: number;
};

export function summarizeProduction(events: ProductionFinish[]) {
  const byUser = new Map<string, { userId: string; displayName: string; pieces: number; orderNos: Set<string>; grades: Set<number> }>();
  for (const event of events) {
    const current = byUser.get(event.userId) ?? {
      userId: event.userId,
      displayName: event.displayName,
      pieces: 0,
      orderNos: new Set<string>(),
      grades: new Set<number>(),
    };
    current.pieces += event.pieces;
    current.orderNos.add(event.orderNo);
    if (event.difficultyGrade) {
      current.grades.add(event.difficultyGrade);
    }
    byUser.set(event.userId, current);
  }
  return [...byUser.values()]
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      pieces: row.pieces,
      orders: row.orderNos.size,
      orderNos: [...row.orderNos].sort(),
      grades: [...row.grades].sort((left, right) => left - right),
    }))
    .sort((left, right) => right.pieces - left.pieces || left.displayName.localeCompare(right.displayName, 'pt-BR'));
}
