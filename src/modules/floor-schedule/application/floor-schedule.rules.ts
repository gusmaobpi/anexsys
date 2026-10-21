export const FLOOR_SCHEDULE_MAX_DAYS = 31;

export const FLOOR_PROFILES = ['tecnico', 'qualidade', 'gerente', 'atendente'] as const;

export type FloorProfile = (typeof FLOOR_PROFILES)[number];

export const FLOOR_PROFILE_ROLE_CODES: Record<FloorProfile, string[]> = {
  tecnico: ['TECNICO', 'PRODUCAO'],
  qualidade: ['QUALIDADE'],
  gerente: ['GERENTE'],
  atendente: ['ATENDENTE'],
};

export function balanceProduction(due: number[], capacity: number[]): number[] {
  const load = due.map((value) => Math.max(0, value));
  for (let index = 0; index < load.length; index += 1) {
    const cap = Math.max(0, capacity[index] ?? 0);
    if (load[index] > cap) {
      const overflow = load[index] - cap;
      if (index + 1 < load.length) {
        load[index] = cap;
        load[index + 1] += overflow;
      }
    } else if (load[index] < cap) {
      let spare = cap - load[index];
      for (let later = index + 1; later < load.length && spare > 0; later += 1) {
        const take = Math.min(spare, load[later]);
        load[later] -= take;
        load[index] += take;
        spare -= take;
      }
    }
  }
  return load;
}

export function saoPauloToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function weekdayOfIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export const FLOOR_DAY_BOARD_AHEAD = 5;

export function dayBoardDates(today: string): string[] {
  return eachIsoDate(today, addIsoDays(today, FLOOR_DAY_BOARD_AHEAD));
}

export function eachIsoDate(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    return [];
  }
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function schedulePeriodError(from: string, to: string): string | null {
  const dates = eachIsoDate(from, to);
  if (dates.length === 0) {
    return 'Informe um período válido.';
  }
  if (dates.length > FLOOR_SCHEDULE_MAX_DAYS) {
    return 'O período da grade vai até um mês.';
  }
  return null;
}

export type FloorPresence = 'confirmed' | 'identified' | 'active';

export function floorPresence(input: {
  scheduled: boolean;
  sessionOpen: boolean;
  pickedToday: boolean;
}): FloorPresence | null {
  if (input.pickedToday) {
    return 'active';
  }
  if (input.sessionOpen) {
    return 'identified';
  }
  if (input.scheduled) {
    return 'confirmed';
  }
  return null;
}
