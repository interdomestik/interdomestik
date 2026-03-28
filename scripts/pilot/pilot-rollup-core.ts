export type PilotClaimMessageRecord = {
  createdAt: Date | null;
  isInternal?: boolean | null;
};

export type PilotClaimStageHistoryRecord = {
  createdAt: Date | null;
  toStatus: string | null;
};

export type PilotClaimRollupRecord = {
  createdAt: Date | null;
  id: string;
  messages: PilotClaimMessageRecord[];
  stageHistory: PilotClaimStageHistoryRecord[];
  status: string | null;
  tenantId: string | null;
};

type PilotWindowParams = {
  claims: PilotClaimRollupRecord[];
  end: Date;
  start: Date;
  tenantId: string;
};

type SlaSummary = {
  breaches: number;
  denominator: number;
  missingEvidence: number;
  numerator: number;
  ratio: string;
};

type ProgressionSummary = {
  denominator: number;
  missingEvidence: number;
  numerator: number;
  ratio: string;
};

export type PilotWeekRollup = {
  progression: ProgressionSummary;
  publicUpdate: SlaSummary;
  submittedClaims: number;
  totalClaims: number;
  triage: SlaSummary;
};

const PROGRESSION_STATUSES = new Set(['verification', 'evaluation', 'negotiation', 'resolved']);

export function formatRatio(passed: number, total: number): string {
  if (total === 0) {
    return 'n/a';
  }

  return `${((passed / total) * 100).toFixed(1)}%`;
}

function sortByCreatedAt<T extends { createdAt: Date | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTime = left.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightTime = right.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return leftTime - rightTime;
  });
}

function selectCohortClaims({ claims, end, start, tenantId }: PilotWindowParams) {
  return claims.filter(
    claim =>
      claim.tenantId === tenantId &&
      Boolean(claim.createdAt) &&
      claim.createdAt!.getTime() >= start.getTime() &&
      claim.createdAt!.getTime() < end.getTime()
  );
}

function findFirstTriageEvent(claim: PilotClaimRollupRecord) {
  return sortByCreatedAt(claim.stageHistory).find(
    event => event.toStatus === 'verification' && Boolean(event.createdAt)
  );
}

function findFirstPublicUpdate(claim: PilotClaimRollupRecord) {
  return sortByCreatedAt(claim.messages).find(
    message => message.isInternal !== true && Boolean(message.createdAt)
  );
}

function findFirstProgressionEvent(claim: PilotClaimRollupRecord) {
  return sortByCreatedAt(claim.stageHistory).find(
    event =>
      Boolean(event.createdAt) &&
      Boolean(event.toStatus) &&
      PROGRESSION_STATUSES.has(event.toStatus)
  );
}

export function computePilotWeekRollup(params: PilotWindowParams): PilotWeekRollup {
  const cohortClaims = selectCohortClaims(params);
  const submittedClaims = cohortClaims.filter(claim => claim.status !== 'draft');

  const triageResults = submittedClaims.map(claim => {
    const triageEvent = findFirstTriageEvent(claim);
    if (!claim.createdAt || !triageEvent?.createdAt) {
      return { missingEvidence: true, withinSla: false };
    }

    const elapsedHours = (triageEvent.createdAt.getTime() - claim.createdAt.getTime()) / 3_600_000;
    return { missingEvidence: false, withinSla: elapsedHours <= 4 };
  });

  const triageMeasured = triageResults.filter(result => !result.missingEvidence);
  const triagePassed = triageMeasured.filter(result => result.withinSla).length;

  const updateResults = submittedClaims.map(claim => {
    const triageEvent = findFirstTriageEvent(claim);
    const publicUpdate = findFirstPublicUpdate(claim);

    if (!triageEvent?.createdAt || !publicUpdate?.createdAt) {
      return { missingEvidence: true, withinSla: false };
    }

    const elapsedHours =
      (publicUpdate.createdAt.getTime() - triageEvent.createdAt.getTime()) / 3_600_000;
    return { missingEvidence: false, withinSla: elapsedHours <= 24 };
  });

  const updateMeasured = updateResults.filter(result => !result.missingEvidence);
  const updatePassed = updateMeasured.filter(result => result.withinSla).length;

  const progressionResults = submittedClaims.map(claim => {
    const progressionEvent = findFirstProgressionEvent(claim);
    if (!claim.createdAt || !progressionEvent?.createdAt) {
      return false;
    }

    const elapsedHours =
      (progressionEvent.createdAt.getTime() - claim.createdAt.getTime()) / 3_600_000;
    return elapsedHours <= 48;
  });

  const progressionPassed = progressionResults.filter(Boolean).length;

  return {
    progression: {
      denominator: submittedClaims.length,
      missingEvidence: 0,
      numerator: progressionPassed,
      ratio: formatRatio(progressionPassed, submittedClaims.length),
    },
    publicUpdate: {
      breaches: updateMeasured.length - updatePassed,
      denominator: updateMeasured.length,
      missingEvidence: updateResults.filter(result => result.missingEvidence).length,
      numerator: updatePassed,
      ratio: formatRatio(updatePassed, updateMeasured.length),
    },
    submittedClaims: submittedClaims.length,
    totalClaims: cohortClaims.length,
    triage: {
      breaches: triageMeasured.length - triagePassed,
      denominator: triageMeasured.length,
      missingEvidence: triageResults.filter(result => result.missingEvidence).length,
      numerator: triagePassed,
      ratio: formatRatio(triagePassed, triageMeasured.length),
    },
  };
}
