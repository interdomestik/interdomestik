/**
 * Claim timeline estimator.
 *
 * Provides realistic milestone ranges based on claim type and confidence
 * level. Timelines are ranges, not promises.
 */

import type { ClaimPackType, ClaimTimeline, ConfidenceLevel, TimelineMilestone } from './types';

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

const EVIDENCE_COLLECTION_RANGES: Record<ConfidenceLevel, string> = {
  high: '1–3 days',
  medium: '3–7 days',
  low: '1–3 weeks',
};

const FIRST_LETTER_RANGES: Record<ConfidenceLevel, string> = {
  high: '1–2 days',
  medium: '3–5 days',
  low: '1–2 weeks',
};

const CLAIM_TYPE_MILESTONES: Record<
  ClaimPackType,
  {
    assessment: (level: ConfidenceLevel) => TimelineMilestone;
    resolution: Record<ConfidenceLevel, TimelineMilestone>;
  }
> = {
  vehicle: {
    assessment: level => ({
      id: 'insurer_assessment',
      label: 'Insurance assessment',
      estimatedRange: level === 'high' ? '1–2 weeks' : '2–4 weeks',
      description: 'The insurance company reviews and assesses the damage',
    }),
    resolution: {
      high: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '4–8 weeks',
        description: 'Typical timeframe for full settlement of vehicle damage claims',
      },
      medium: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '6–12 weeks',
        description: 'Typical timeframe for full settlement of vehicle damage claims',
      },
      low: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '3–6 months',
        description: 'Typical timeframe for full settlement of vehicle damage claims',
      },
    },
  },
  property: {
    assessment: level => ({
      id: 'damage_assessment',
      label: 'Professional assessment',
      estimatedRange: level === 'high' ? '1–2 weeks' : '2–4 weeks',
      description: 'Professional assessment of property damage and repair costs',
    }),
    resolution: {
      high: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '6–12 weeks',
        description: 'Typical timeframe for property damage claim resolution',
      },
      medium: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '2–4 months',
        description: 'Typical timeframe for property damage claim resolution',
      },
      low: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '4–8 months',
        description: 'Typical timeframe for property damage claim resolution',
      },
    },
  },
  injury: {
    assessment: level => ({
      id: 'medical_documentation',
      label: 'Medical documentation',
      estimatedRange: level === 'high' ? '1–2 weeks' : '2–6 weeks',
      description: 'Obtaining complete medical records and prognosis reports',
    }),
    resolution: {
      high: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '2–4 months',
        description:
          'Injury claims typically take longer due to medical documentation requirements',
      },
      medium: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '3–6 months',
        description:
          'Injury claims typically take longer due to medical documentation requirements',
      },
      low: {
        id: 'resolution',
        label: 'Expected resolution',
        estimatedRange: '6–12 months',
        description:
          'Injury claims typically take longer due to medical documentation requirements',
      },
    },
  },
};

function commonMilestones(level: ConfidenceLevel): TimelineMilestone[] {
  return [
    {
      id: 'evidence_collection',
      label: 'Evidence collection',
      estimatedRange: EVIDENCE_COLLECTION_RANGES[level],
      description: 'Gather all required documents and evidence for your claim',
    },
    {
      id: 'first_letter',
      label: 'First letter sent',
      estimatedRange: FIRST_LETTER_RANGES[level],
      description: 'Send your complaint or demand letter to the responsible party',
    },
    {
      id: 'expected_response',
      label: 'Expected response',
      estimatedRange: '15–30 business days',
      description: 'Standard response period for the counterparty after receiving your letter',
    },
  ];
}

function escalationMilestone(): TimelineMilestone {
  return {
    id: 'escalation_window',
    label: 'Escalation window',
    estimatedRange: 'After counterparty response',
    description:
      'If the response is unsatisfactory, you can escalate to staff-led recovery through Asistenca membership',
  };
}

function baseMilestones(claimType: ClaimPackType, level: ConfidenceLevel): TimelineMilestone[] {
  const typedMilestones = CLAIM_TYPE_MILESTONES[claimType];

  return [
    ...commonMilestones(level),
    typedMilestones.assessment(level),
    typedMilestones.resolution[level],
    escalationMilestone(),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function estimateTimeline(
  claimType: ClaimPackType,
  confidenceLevel: ConfidenceLevel
): ClaimTimeline {
  return {
    claimType,
    confidenceLevel,
    milestones: baseMilestones(claimType, confidenceLevel),
  };
}
