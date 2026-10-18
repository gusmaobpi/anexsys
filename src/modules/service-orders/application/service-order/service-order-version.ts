export const DEFAULT_MAX_PIECES_PER_BAG = 5;

export const PROCESS_SUFFIX = {
  COUNTER: 'C',
  REWORK: 'R',
  WARRANTY: 'G',
} as const;

export type ProcessSuffixLetter = (typeof PROCESS_SUFFIX)[keyof typeof PROCESS_SUFFIX];

const LETTERS = 26;
const DIGITS_PER_BLOCK = 999999;
const SUFFIX_TAIL = /-(?:\d+|[A-Za-z]\d*)$/;

export function formatServiceOrderNo(groupSeq: number, versionSuffix?: string | null): string {
  const base = formatServiceOrderPlate(groupSeq);
  return versionSuffix ? `${base}-${versionSuffix}` : base;
}

export function formatServiceOrderPlate(groupSeq: number): string {
  if (!Number.isInteger(groupSeq) || groupSeq < 1) {
    throw new Error('A sequência da OS precisa ser um número positivo.');
  }

  const index = groupSeq - 1;
  const letterIndex = Math.floor(index / DIGITS_PER_BLOCK);
  const letterSpace = LETTERS * LETTERS * LETTERS;
  if (letterIndex >= letterSpace) {
    throw new Error('A numeração da OS esgotou as combinações AAA000001 a ZZZ999999.');
  }

  const first = String.fromCharCode(65 + Math.floor(letterIndex / (LETTERS * LETTERS)));
  const second = String.fromCharCode(65 + Math.floor((letterIndex % (LETTERS * LETTERS)) / LETTERS));
  const third = String.fromCharCode(65 + (letterIndex % LETTERS));
  const digits = String((index % DIGITS_PER_BLOCK) + 1).padStart(6, '0');
  return `${first}${second}${third}${digits}`;
}

export function stripVersionSuffix(orderNo: string): string {
  return orderNo.replace(SUFFIX_TAIL, '');
}

export function withVersionSuffix(orderNo: string, versionSuffix: string): string {
  return `${stripVersionSuffix(orderNo)}-${versionSuffix}`;
}

export function isBagVersionSuffix(suffix: string | null | undefined): boolean {
  return Boolean(suffix?.trim() && /^\d+$/.test(suffix.trim()));
}

export function isProcessSuffix(suffix: string | null | undefined): boolean {
  return Boolean(suffix?.trim() && /^[A-Za-z]\d*$/.test(suffix.trim()));
}

export function isProcessRow(row?: { versionSuffix?: string | null; returnKind?: string | null } | null): boolean {
  return Boolean(row && (isProcessSuffix(row.versionSuffix) || row.returnKind));
}

export function nextBagVersionSuffix(existingSuffixes: Array<string | null | undefined>): string {
  let max = 0;
  for (const suffix of existingSuffixes) {
    const trimmed = suffix?.trim();
    if (!trimmed) {
      continue;
    }
    if (/^\d+$/.test(trimmed)) {
      max = Math.max(max, Number(trimmed));
      continue;
    }
    if (/^[A-Z]$/i.test(trimmed) && !isReservedProcessLetter(trimmed)) {
      max = Math.max(max, trimmed.toUpperCase().charCodeAt(0) - 64);
    }
  }
  return String(max + 1);
}

/** @deprecated Use nextBagVersionSuffix. Kept so leftover bag-version calls keep compiling. */
export function nextVersionSuffix(existingSuffixes: Array<string | null | undefined>): string {
  return nextBagVersionSuffix(existingSuffixes);
}

export function nextProcessSuffix(
  letter: ProcessSuffixLetter,
  existingSuffixes: Array<string | null | undefined>,
): string {
  const used = new Set(
    existingSuffixes
      .map((suffix) => suffix?.trim().toUpperCase())
      .filter((suffix): suffix is string => typeof suffix === 'string' && suffix.length > 0 && new RegExp(`^${letter}\d*$`, 'i').test(suffix)),
  );

  if (!used.has(letter)) {
    return letter;
  }

  let index = 2;
  while (used.has(`${letter}${index}`)) {
    index += 1;
  }
  return `${letter}${index}`;
}

export function processLetterForReturnKind(kind: string | null | undefined): ProcessSuffixLetter | null {
  if (kind === 'reconserto') {
    return PROCESS_SUFFIX.REWORK;
  }
  if (kind === 'warranty') {
    return PROCESS_SUFFIX.WARRANTY;
  }
  if (kind === 'counter') {
    return PROCESS_SUFFIX.COUNTER;
  }
  return null;
}

function isReservedProcessLetter(suffix: string): boolean {
  return (Object.values(PROCESS_SUFFIX) as string[]).includes(suffix.toUpperCase());
}
