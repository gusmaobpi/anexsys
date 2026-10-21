export type QualityPieceDecision = 'pending' | 'approved' | 'rejected' | 'in_rework';
export type QualityReviewPhase = 'needs_review' | 'rework_issued' | 'ready';

export type QualityRecordLike = {
  id?: string;
  serviceOrderItemId: string | null;
  inspectionAt: Date | string;
  releaseDecision: string;
  notes?: string | null;
  inspectionType?: string;
};

export type QualityVersionLike = {
  isActive: boolean;
  versionNo: number;
  versionReason: string;
  affectedServiceOrderItemIds?: string[] | null;
};

const CORRECTIVE_REASONS = new Set(['rework', 'warranty_execution', 'corrective_production']);

export function latestQualityRecordByItem(records: QualityRecordLike[]): Map<string, QualityRecordLike> {
  const map = new Map<string, QualityRecordLike>();
  const sorted = [...records].sort((left, right) => {
    return new Date(right.inspectionAt).getTime() - new Date(left.inspectionAt).getTime();
  });
  for (const record of sorted) {
    if (!record.serviceOrderItemId || map.has(record.serviceOrderItemId)) {
      continue;
    }
    map.set(record.serviceOrderItemId, record);
  }
  return map;
}

export function activeCorrectiveVersion(versions: QualityVersionLike[]): QualityVersionLike | null {
  return versions.find((version) => version.isActive && CORRECTIVE_REASONS.has(version.versionReason)) ?? null;
}

export function currentReviewItemIds(allItemIds: string[], activeVersion: QualityVersionLike | null): string[] {
  const affected = activeVersion?.affectedServiceOrderItemIds?.filter(Boolean) ?? [];
  if (affected.length > 0) {
    return allItemIds.filter((itemId) => affected.includes(itemId));
  }
  return allItemIds;
}

export function isReworkWaitingReturn(
  activeVersion: QualityVersionLike | null,
  latestByItem: Map<string, QualityRecordLike>,
  currentItemIds: string[],
): boolean {
  if (!activeVersion || currentItemIds.length === 0) {
    return false;
  }
  return currentItemIds.every((itemId) => {
    const latest = latestByItem.get(itemId);
    return latest?.releaseDecision === 'rejected' || latest?.releaseDecision === 'rework_requested';
  });
}

export function reviewPieceState(
  latest: QualityRecordLike | undefined,
  inCurrentRound: boolean,
  reworkWaitingReturn: boolean,
  status: string,
): { decision: QualityPieceDecision; canDecide: boolean } {
  const returned = reworkWaitingReturn && status === 'awaiting_quality';
  const state = pieceReviewState(latest, inCurrentRound, reworkWaitingReturn && !returned);
  if (
    returned &&
    inCurrentRound &&
    (latest?.releaseDecision === 'rejected' || latest?.releaseDecision === 'rework_requested')
  ) {
    return { decision: 'pending', canDecide: true };
  }
  return state;
}

export function reviewPhase(status: string, allItemsApproved: boolean, reworkWaitingReturn: boolean): QualityReviewPhase {
  if (status === 'ready_for_pickup') {
    return 'ready';
  }
  const onBelt = reworkWaitingReturn && status !== 'awaiting_quality';
  return deriveReviewPhase({ allItemsApproved, reworkWaitingReturn: onBelt });
}

export function pieceReviewState(
  latest: QualityRecordLike | undefined,
  inCurrentRound: boolean,
  reworkWaitingReturn: boolean,
): { decision: QualityPieceDecision; canDecide: boolean } {
  if (latest?.releaseDecision === 'approved') {
    return { decision: 'approved', canDecide: false };
  }
  if (latest?.releaseDecision === 'pending') {
    return { decision: 'pending', canDecide: inCurrentRound };
  }
  if (latest?.releaseDecision === 'rejected' || latest?.releaseDecision === 'rework_requested') {
    if (reworkWaitingReturn && inCurrentRound) {
      return { decision: 'in_rework', canDecide: false };
    }
    return { decision: 'rejected', canDecide: inCurrentRound };
  }
  return { decision: 'pending', canDecide: inCurrentRound && !reworkWaitingReturn };
}

export function deriveReviewPhase(input: { allItemsApproved: boolean; reworkWaitingReturn: boolean }): QualityReviewPhase {
  if (input.allItemsApproved) {
    return 'ready';
  }
  if (input.reworkWaitingReturn) {
    return 'rework_issued';
  }
  return 'needs_review';
}

export function currentRoundFinished(currentItems: Array<{ decision: QualityPieceDecision }>): boolean {
  return currentItems.length > 0 && currentItems.every((item) => item.decision === 'approved' || item.decision === 'rejected');
}

/** Lista da qualidade: sacola já terminada na esteira, aguardando revisão. */
export function belongsToQualityQueue(status: string, bagClosed: boolean): boolean {
  return bagClosed && status === 'awaiting_quality';
}
