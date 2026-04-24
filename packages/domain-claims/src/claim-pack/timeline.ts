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

function baseMilestones(claimType: ClaimPackType, level: ConfidenceLevel): TimelineMilestone[] {
  const fast = level === 'high';
  const slow = level === 'low';

  const common: TimelineMilestone[] = [
    {
      id: 'evidence_collection',
      label: 'Evidence collection',
      estimatedRange: fast ? '1–3 days' : slow ? '1–3 weeks' : '3–7 days',
      description: 'Gather all required documents and evidence for your claim',
    },
    {
      id: 'first_letter',
      label: 'First letter sent',
      estimatedRange: fast ? '1–2 days' : slow ? '1–2 weeks' : '3–5 days',
      description: 'Send your complaint or demand letter to the responsible party',
    },
    {
      id: 'expected_response',
      label: 'Expected response',
      estimatedRange: '15–30 business days',
      description: 'Standard response period for the counterparty after receiving your letter',
    },
  ];

  // Claim-type-specific milestones
  switch (claimType) {
    case 'vehicle':
      common.push(
        {
          id: 'insurer_assessment',
          label: 'Insurance assessment',
          estimatedRange: fast ? '1–2 weeks' : '2–4 weeks',
          description: 'The insurance company reviews and assesses the damage',
        },
        {
          id: 'resolution',
          label: 'Expected resolution',
          estimatedRange: fast ? '4–8 weeks' : slow ? '3–6 months' : '6–12 weeks',
          description: 'Typical timeframe for full settlement of vehicle damage claims',
        }
      );
      break;
    case 'property':
      common.push(
        {
          id: 'damage_assessment',
          label: 'Professional assessment',
          estimatedRange: fast ? '1–2 weeks' : '2–4 weeks',
          description: 'Professional assessment of property damage and repair costs',
        },
        {
          id: 'resolution',
          label: 'Expected resolution',
          estimatedRange: fast ? '6–12 weeks' : slow ? '4–8 months' : '2–4 months',
          description: 'Typical timeframe for property damage claim resolution',
        }
      );
      break;
    case 'injury':
      common.push(
        {
          id: 'medical_documentation',
          label: 'Medical documentation',
          estimatedRange: fast ? '1–2 weeks' : '2–6 weeks',
          description: 'Obtaining complete medical records and prognosis reports',
        },
        {
          id: 'resolution',
          label: 'Expected resolution',
          estimatedRange: fast ? '2–4 months' : slow ? '6–12 months' : '3–6 months',
          description:
            'Injury claims typically take longer due to medical documentation requirements',
        }
      );
      break;
    default: {
      const _exhaustive: never = claimType;
      throw new Error(`Unknown claim type: ${_exhaustive}`);
    }
  }

  // Escalation window (common to all)
  common.push({
    id: 'escalation_window',
    label: 'Escalation window',
    estimatedRange: 'After counterparty response',
    description:
      'If the response is unsatisfactory, you can escalate to staff-led recovery through Asistenca membership',
  });

  return common;
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
