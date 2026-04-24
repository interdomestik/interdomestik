/**
 * Deterministic confidence scoring engine.
 *
 * Scores claim viability on a 0–100 scale using five weighted factors:
 * incident recency, counterparty identification, evidence strength,
 * monetary path clarity, and claim-type match.
 *
 * No AI. Fully deterministic for the same inputs.
 */

import {
  COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES,
  COMMERCIAL_GUIDANCE_ONLY_CATEGORIES,
} from '../claims/commercial-launch-scope';
import type {
  ClaimPackType,
  ConfidenceFactor,
  ConfidenceLevel,
  ConfidenceResult,
  IntakeAnswers,
} from './types';

// ---------------------------------------------------------------------------
// Factor calculators
// ---------------------------------------------------------------------------

function scoreIncidentRecency(incidentDate: string, referenceDate: Date): ConfidenceFactor {
  const MAX = 20;
  const parsedDate = new Date(incidentDate).getTime();
  const referenceTime = referenceDate.getTime();
  const daysSince = Number.isFinite(parsedDate)
    ? Math.floor((referenceTime - parsedDate) / (1000 * 60 * 60 * 24))
    : Number.POSITIVE_INFINITY;

  let points: number;
  let explanation: string;

  if (daysSince < 0 || !Number.isFinite(daysSince)) {
    points = 0;
    explanation = 'Incident date is invalid or in the future — confirm the incident date';
  } else if (daysSince < 30) {
    points = 20;
    explanation = `Recent incident (${daysSince} days ago) — strong position`;
  } else if (daysSince <= 90) {
    points = 15;
    explanation = `Incident ${daysSince} days ago — within standard limitation periods`;
  } else if (daysSince <= 365) {
    points = 10;
    explanation = `Incident ${daysSince} days ago — still actionable but urgency is lower`;
  } else {
    points = 0;
    explanation = `Incident over a year ago — limitation periods may apply`;
  }

  return { name: 'Incident recency', pointsEarned: points, maxPoints: MAX, explanation };
}

function scoreCounterparty(answers: IntakeAnswers): ConfidenceFactor {
  const MAX = 20;
  const name = 'counterpartyName' in answers ? answers.counterpartyName : undefined;

  if (name && name.trim().length > 2) {
    return {
      name: 'Counterparty identified',
      pointsEarned: 20,
      maxPoints: MAX,
      explanation: 'Named counterparty — clear target for the claim',
    };
  }
  if (name && name.trim().length > 0) {
    return {
      name: 'Counterparty identified',
      pointsEarned: 10,
      maxPoints: MAX,
      explanation: 'Partial counterparty info — may need further identification',
    };
  }
  return {
    name: 'Counterparty identified',
    pointsEarned: 0,
    maxPoints: MAX,
    explanation: 'No counterparty identified — recovery may be difficult',
  };
}

function scoreEvidenceStrength(
  answers: IntakeAnswers,
  uploadedFileCount: number
): ConfidenceFactor {
  const MAX = 20;
  const hasPhotos =
    ('hasDamagePhotos' in answers && answers.hasDamagePhotos) || uploadedFileCount > 0;

  const hasDocs =
    ('policeReportFiled' in answers && answers.policeReportFiled) ||
    ('hasOwnershipProof' in answers && answers.hasOwnershipProof) ||
    ('hasMedicalRecords' in answers && answers.hasMedicalRecords) ||
    ('hasIncidentReport' in answers && answers.hasIncidentReport);

  if (hasPhotos && hasDocs) {
    return {
      name: 'Evidence strength',
      pointsEarned: 20,
      maxPoints: MAX,
      explanation: 'Photos and documentation available — strong evidence base',
    };
  }
  if (hasPhotos) {
    return {
      name: 'Evidence strength',
      pointsEarned: 12,
      maxPoints: MAX,
      explanation: 'Photos available but supporting documents are missing',
    };
  }
  if (hasDocs) {
    return {
      name: 'Evidence strength',
      pointsEarned: 10,
      maxPoints: MAX,
      explanation: 'Documentation available but photos would strengthen the case',
    };
  }
  return {
    name: 'Evidence strength',
    pointsEarned: 0,
    maxPoints: MAX,
    explanation: 'No evidence provided yet — collecting evidence is the first step',
  };
}

function scoreMonetaryPath(answers: IntakeAnswers): ConfidenceFactor {
  const MAX = 20;
  const amount = answers.estimatedAmount;

  if (amount && amount > 0) {
    return {
      name: 'Monetary path',
      pointsEarned: 20,
      maxPoints: MAX,
      explanation: 'Clear monetary loss identified — recovery path is defined',
    };
  }
  if (typeof amount === 'number' && amount === 0) {
    return {
      name: 'Monetary path',
      pointsEarned: 12,
      maxPoints: MAX,
      explanation: 'Loss is estimated but not quantified yet — refine the amount before sending',
    };
  }
  return {
    name: 'Monetary path',
    pointsEarned: 5,
    maxPoints: MAX,
    explanation: 'No estimated amount provided — quantifying loss will strengthen the claim',
  };
}

function scoreClaimTypeMatch(claimType: ClaimPackType): ConfidenceFactor {
  const MAX = 20;

  if (COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES.has(claimType)) {
    return {
      name: 'Claim type match',
      pointsEarned: 20,
      maxPoints: MAX,
      explanation: 'This claim type is fully supported for escalation and recovery',
    };
  }
  if (COMMERCIAL_GUIDANCE_ONLY_CATEGORIES.has(claimType)) {
    return {
      name: 'Claim type match',
      pointsEarned: 5,
      maxPoints: MAX,
      explanation: 'This claim type is supported for guidance only, not full recovery',
    };
  }
  return {
    name: 'Claim type match',
    pointsEarned: 0,
    maxPoints: MAX,
    explanation: 'This claim type is outside the current service scope',
  };
}

// ---------------------------------------------------------------------------
// Level thresholds
// ---------------------------------------------------------------------------

function toLevel(score: number): ConfidenceLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function calculateConfidence(
  claimType: ClaimPackType,
  answers: IntakeAnswers,
  uploadedFileCount = 0,
  referenceDate = new Date()
): ConfidenceResult {
  const factors: ConfidenceFactor[] = [
    scoreIncidentRecency(answers.incidentDate, referenceDate),
    scoreCounterparty(answers),
    scoreEvidenceStrength(answers, uploadedFileCount),
    scoreMonetaryPath(answers),
    scoreClaimTypeMatch(claimType),
  ];

  const score = factors.reduce((sum, f) => sum + f.pointsEarned, 0);

  return {
    score,
    level: toLevel(score),
    factors,
  };
}
